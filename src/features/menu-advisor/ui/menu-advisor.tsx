"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Notice } from "@/components/notice";
import { useOption } from "@/lib/use-option";
import { prepareMenuPhoto, type MenuReading } from "../actions/read-menu";
import { defaultChoices, drinkOptions, estimateTotalSek, optionFor, recommendOptions } from "../index";
import type { Choices, PersonOptions } from "../domain/options";
import { type HouseholdPerson, meId } from "../domain/people";
import type { Person } from "../domain/profile";
import { pickId } from "../domain/tonight";
import type { MenuDish } from "../domain/types";
import { dishSek } from "../domain/view";
import { AnswerScreen } from "./answer-screen";
import { CompanySheet } from "./company-sheet";
import { DrinkSheet } from "./drink-sheet";
import { EmptyReading } from "./empty-reading";
import { FullMenuScreen } from "./full-menu-screen";
import { choose, chooseDrink, emptyReadingView, foldReading, hasProfileInfo, withOption, type ReadingView } from "./journey";
import { readMenuWithFallback } from "./read-with-fallback";
import { ReadingScreen } from "./reading-screen";
import { StartScreen } from "./start-screen";
import { TonightList } from "./tonight-list";
import { usePeople } from "./use-people";
import { useTonight } from "./use-tonight";
import { YourChoiceScreen } from "./your-choice-screen";

// Menyrådgivare (Tillval, off by default), "En enkel resa": one thing per screen. Fota menyn, the app reads it live
// (POST /api/menu/read?stream=1, the dishes come in one by one), proposes two or three dishes per person, you choose,
// and "Ert val" is a clean summary to show the waiter. The whole menu and each dish are one tap away.
// Nothing is saved except "Ikväll", the dishes starred in this session. The photo stays in memory only.

type Stage = "start" | "reading" | "answer" | "choice" | "menu";
type Mode = "help" | "explain";

const noopSubscribe = () => () => {};
const skippedKey = "livskoll-menu-first-time-skipped";

function readSkipped(): boolean {
  try {
    return localStorage.getItem(skippedKey) === "1";
  } catch {
    return false;
  }
}

/**
 * `members`: the household's members (read on the server), pickable as company from the start; null = not readable.
 * `profiles`: the household's saved profiles (read on the server); null = not readable, so this device's own list.
 */
export function MenuAdvisor({ members = null, profiles = null }: { members?: readonly HouseholdPerson[] | null; profiles?: Person[] | null }) {
  const enabled = useOption("menuAdvisor");
  // Off on the server and during hydration: nothing flashes for people who have it on.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [stage, setStage] = useState<Stage>("start");
  const [mode, setMode] = useState<Mode>("help");
  const [careful, setCareful] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<MenuReading | null>(null);
  const [view, setView] = useState<ReadingView>(emptyReadingView);
  const [journey, setJourney] = useState<{ options: PersonOptions[]; choices: Choices }>({ options: [], choices: {} });
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [drinkOf, setDrinkOf] = useState<string | null>(null);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [showTonight, setShowTonight] = useState(false);
  const [skipped, setSkipped] = useState(readSkipped);
  const tonight = useTonight();
  const { people, save } = usePeople(members, profiles);
  // Who is with tonight: ids of saved people plus guests added for tonight only (gone when the page closes).
  const [selectedIds, setSelectedIds] = useState<string[]>([meId]);
  const [tempGuests, setTempGuests] = useState<Person[]>([]);
  const photo = useRef<Blob | null>(null);
  const request = useRef<AbortController | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  // Where a stopped or failed reading goes back to: the screen it was started from.
  const backStage = useRef<Stage>("start");

  useEffect(() => () => request.current?.abort(), []);

  const everyone = useMemo(() => [...people, ...tempGuests], [people, tempGuests]);
  // Never nobody: with all unticked, "Du" is with.
  const company = useMemo(() => {
    const chosen = everyone.filter((person) => selectedIds.includes(person.id));
    return chosen.length > 0 ? chosen : everyone.slice(0, 1);
  }, [everyone, selectedIds]);

  if (!mounted) return null;
  if (!enabled) {
    return (
      <Notice
        action={
          <Link href="/installningar/tillval" className="inline-flex min-h-tap items-center pl-3 font-semibold underline">
            Öppna Tillval
          </Link>
        }
      >
        Menyrådgivaren är avstängd. Slå på den under Inställningar, Tillval.
      </Notice>
    );
  }

  const explain = mode === "explain";
  const readingCompany = explain ? [] : company;

  function apply(next: MenuReading) {
    const options = explain ? [] : recommendOptions(next.menu, company);
    setReading(next);
    setJourney({ options, choices: defaultChoices(options) });
    setMenuFor(null);
    setStage(explain ? "menu" : "answer");
  }

  async function run(blob: Blob, isCareful: boolean) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setError(null);
    setCareful(isCareful);
    setView(emptyReadingView);
    setStage("reading");
    const answer = await readMenuWithFallback(blob, isCareful ? "careful" : "standard", controller.signal, (event) => {
      if (request.current === controller) setView((current) => foldReading(current, event));
    });
    if (request.current !== controller) return;
    request.current = null;
    if (answer.ok) return apply(answer.data);
    // Stopped by "Avbryt": back to where it was.
    if (answer.error === undefined) return setStage(backStage.current);
    // The dev text of ai_unavailable ("Är datorn med modellen igång?") is not for someone at a restaurant.
    setError(answer.error.code === "ai_unavailable" ? "Det gick inte att läsa menyn just nu. Försök igen." : answer.error.message);
    setStage(backStage.current);
  }

  async function takePhoto(file: File) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    backStage.current = "start";
    setError(null);
    setCareful(false);
    setView(emptyReadingView);
    setStage("reading");
    const prepared = await prepareMenuPhoto(file);
    if (request.current !== controller) return;
    request.current = null;
    if (!prepared.ok) {
      setError(prepared.error.message);
      setStage("start");
      return;
    }
    photo.current = prepared.data;
    await run(prepared.data, false);
  }

  function cancel() {
    request.current?.abort();
    request.current = null;
    setStage(backStage.current);
  }

  function readAgainCarefully() {
    if (!photo.current) return;
    backStage.current = stage;
    void run(photo.current, true);
  }

  function pick(next: Mode) {
    backStage.current = "start";
    setMode(next);
    picker.current?.click();
  }

  function finish() {
    photo.current = null;
    setReading(null);
    setJourney({ options: [], choices: {} });
    setError(null);
    setStage("start");
  }

  function addDish(personId: string, dishIndex: number) {
    const person = company.find((entry) => entry.id === personId);
    if (!reading || !person) return;
    const option = optionFor(reading.menu, dishIndex, person);
    if (!option) return;
    setJourney((current) => ({ options: withOption(current.options, personId, option), choices: choose(current.choices, personId, dishIndex) }));
    setMenuFor(null);
    setStage("answer");
  }

  function starDish(dish: MenuDish) {
    if (!reading) return;
    tonight.toggle({ id: pickId(reading.menu.restaurang, dish.originalnamn), name: dish.originalnamn, explanation: dish.forklaring, restaurant: reading.menu.restaurang, sek: dishSek(dish) });
  }

  const fileInput = (
    // No `capture`: the phone offers the camera and the album in one tap.
    <input
      ref={picker}
      type="file"
      accept="image/*"
      tabIndex={-1}
      aria-hidden="true"
      data-testid="menu-file"
      className="sr-only"
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (file) void takePhoto(file);
      }}
    />
  );

  const canReadCarefully = reading !== null && reading.quality !== "careful";
  const reader = reading?.model && reading.effort ? { model: reading.model, effort: reading.effort } : null;
  const totals = reading ? estimateTotalSek(journey.choices, reading.menu, readingCompany) : null;
  const drinkPerson = company.find((person) => person.id === drinkOf);
  const drinkNow = drinkPerson ? (journey.choices[drinkPerson.id]?.drink ?? drinkPerson.drink) : null;

  let content: ReactNode;
  if (showTonight) {
    content = (
      <TonightList
        picks={tonight.picks}
        onRemove={tonight.toggle}
        onClear={tonight.clear}
        onBack={() => setShowTonight(false)}
        onNext={() => {
          setShowTonight(false);
          finish();
          pick("help");
        }}
      />
    );
  } else if (stage === "reading") {
    content = <ReadingScreen view={view} careful={careful} onCancel={cancel} />;
  } else if (reading && reading.menu.ratter.length === 0 && stage !== "start") {
    content = <EmptyReading error={error} canReadCarefully={canReadCarefully} onCareful={readAgainCarefully} onPhoto={() => pick(mode)} />;
  } else if (reading && totals && stage === "answer") {
    content = (
      <AnswerScreen
        menu={reading.menu}
        company={company}
        options={journey.options}
        choices={journey.choices}
        totals={totals}
        filtered={company.some((person) => person.allergies.length > 0)}
        uncertain={reading.menu.osakert}
        reader={reader}
        canReadCarefully={canReadCarefully}
        error={error}
        onChoose={(personId, dishIndex) => setJourney((current) => ({ ...current, choices: choose(current.choices, personId, dishIndex) }))}
        onMore={(personId) => {
          setMenuFor(personId);
          setStage("menu");
        }}
        onDone={() => setStage("choice")}
        onFullMenu={() => {
          setMenuFor(null);
          setStage("menu");
        }}
        onCareful={readAgainCarefully}
        onBack={finish}
      />
    );
  } else if (reading && totals && stage === "choice") {
    content = (
      <YourChoiceScreen
        menu={reading.menu}
        company={company}
        options={journey.options}
        choices={journey.choices}
        totals={totals}
        onDrink={setDrinkOf}
        onDone={finish}
        onChange={() => setStage("answer")}
      />
    );
  } else if (reading && stage === "menu") {
    content = (
      <FullMenuScreen
        menu={reading.menu}
        company={company}
        explain={explain}
        forPerson={menuFor ? (company.find((person) => person.id === menuFor) ?? null) : null}
        isStarred={(dish) => tonight.picks.some((entry) => entry.id === pickId(reading.menu.restaurang, dish.originalnamn))}
        tonightCount={tonight.picks.length}
        reader={reader}
        canReadCarefully={canReadCarefully}
        error={error}
        onAdd={addDish}
        onStar={starDish}
        onTonight={() => setShowTonight(true)}
        onCareful={readAgainCarefully}
        onBack={() => {
          setMenuFor(null);
          if (explain) finish();
          else setStage("answer");
        }}
        onNext={() => pick(mode)}
      />
    );
  } else {
    content = (
      <StartScreen
        company={company}
        error={error}
        firstTime={!skipped && !everyone.some(hasProfileInfo)}
        onSkipFirstTime={() => {
          setSkipped(true);
          try {
            localStorage.setItem(skippedKey, "1");
          } catch {
            // Blocked storage: the row is back next time.
          }
        }}
        tonightCount={tonight.picks.length}
        onCompany={() => setCompanyOpen(true)}
        onPhoto={() => pick("help")}
        onExplain={() => pick("explain")}
        onTonight={() => setShowTonight(true)}
      />
    );
  }
  return (
    <>
      {content}
      <CompanySheet
        open={companyOpen}
        onClose={() => setCompanyOpen(false)}
        people={people}
        selectedIds={selectedIds}
        onSelectedIds={setSelectedIds}
        tempGuests={tempGuests}
        onTempGuests={setTempGuests}
        onSave={save}
      />
      {reading && drinkPerson ? (
        <DrinkSheet
          open
          personName={drinkPerson.name}
          current={drinkNow}
          options={drinkOptions(reading.menu)}
          onPick={(kind) => {
            setJourney((current) => ({ ...current, choices: chooseDrink(current.choices, drinkPerson.id, kind) }));
            setDrinkOf(null);
          }}
          onClose={() => setDrinkOf(null)}
        />
      ) : null}
      {fileInput}
    </>
  );
}
