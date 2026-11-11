"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Notice } from "@/components/notice";
import type { ErrorCode } from "@/lib/errors";
import { useOption } from "@/lib/use-option";
import { prepareMenuPhoto, type MenuReading } from "../actions/read-menu";
import { readMenuText } from "../actions/read-menu-text";
import { defaultChoices, drinkOptions, estimateTotalSek, optionFor, recommendOptions } from "../index";
import type { Choices, PersonOptions } from "../domain/options";
import { type HouseholdPerson, meId } from "../domain/people";
import type { Person } from "../domain/profile";
import { pickId } from "../domain/tonight";
import type { Menu, MenuDish } from "../domain/types";
import { dishSek } from "../domain/view";
import { AnswerScreen } from "./answer-screen";
import { readCompanyIds, writeCompanyIds } from "./company-store";
import { DrinkSheet } from "./drink-sheet";
import { EmptyReading } from "./empty-reading";
import { FullMenuScreen } from "./full-menu-screen";
import { GuestSheet } from "./guest-sheet";
import { choose, chooseDrink, emptyReadingView, foldReading, withOption, type ReadingView } from "./journey";
import { TopBack } from "./journey-parts";
import { readMenuWithFallback } from "./read-with-fallback";
import { ReadingScreen } from "./reading-screen";
import { StartScreen } from "./start-screen";
import { type MenuStop, StopScreen } from "./stop-screen";
import { TonightList } from "./tonight-list";
import { usePeople } from "./use-people";
import { useTonight } from "./use-tonight";
import { YourChoiceScreen } from "./your-choice-screen";

// Menyrådgivare (Tillval, off by default), "Tolka menyn": one thing per screen. Who eats is ticked on the start, Fota
// menyn, the app reads it live (POST /api/menu/read?stream=1, the dishes come in one by one), proposes two or three
// dishes per person, you choose, and "Ert val" is a clean summary to show the waiter. The whole menu is the second tab
// of the answer. A reading that stops has a screen of its own. Kept on this phone: who was ticked last time, and
// "Ikväll" (the dishes starred in this session). The photo stays in memory only.

type Stage = "start" | "reading" | "answer" | "choice" | "menu" | "stop";

const noopSubscribe = () => () => {};

/** What the stop says when the reading could not be run (the dev text of ai_unavailable is not for someone at a restaurant). */
function stopMessage(code: ErrorCode, message: string, hasPhoto: boolean): string {
  if (code !== "ai_unavailable") return message;
  return hasPhoto ? "Menyn kunde inte läsas. Kontrollera nätet och försök igen. Fotot finns kvar." : "Menyn kunde inte läsas. Kontrollera nätet och försök igen.";
}

/**
 * `members`: the household's members (read on the server), pickable as company from the start; null = not readable.
 * `startSlot`: a quiet link the route layer shows under Fota menyn on the start screen only (Sök restauranger).
 * `profiles`: the household's saved profiles (read on the server); null = not readable, so this device's own list.
 * `canRaiseCap`: the signed-in user is the app's owner, so the AI-cap stop offers "Höj taket".
 */
export function MenuAdvisor({
  members = null,
  profiles = null,
  startSlot,
  canRaiseCap = false,
  initialMenu,
  startWithMenuText,
}: {
  members?: readonly HouseholdPerson[] | null;
  profiles?: Person[] | null;
  startSlot?: ReactNode;
  canRaiseCap?: boolean;
  /** A menu the route layer already holds: the advisor starts on its answer, with no photo and no reading. */
  initialMenu?: Menu;
  /** Plain menu text (from a restaurant's own website): the advisor reads it (readMenuText) and goes on as with a photo. `initialMenu` wins when both are given. */
  startWithMenuText?: string;
}) {
  const enabled = useOption("menuAdvisor");
  // Off on the server and during hydration: nothing flashes for people who have it on.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [stage, setStage] = useState<Stage>("start");
  const [careful, setCareful] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stop, setStop] = useState<MenuStop | null>(null);
  const [reading, setReading] = useState<MenuReading | null>(null);
  const [view, setView] = useState<ReadingView>(emptyReadingView);
  const [journey, setJourney] = useState<{ options: PersonOptions[]; choices: Choices }>({ options: [], choices: {} });
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [drinkOf, setDrinkOf] = useState<string | null>(null);
  const [guestOpen, setGuestOpen] = useState(false);
  const [showTonight, setShowTonight] = useState(false);
  const tonight = useTonight();
  const { people, save } = usePeople(members, profiles);
  // Who is with tonight: ids of saved people plus guests added for tonight only (gone when the page closes). It
  // starts with whoever was ticked last time on this phone.
  const [selectedIds, setSelectedIds] = useState<string[]>(() => readCompanyIds() ?? [meId]);
  const [tempGuests, setTempGuests] = useState<Person[]>([]);
  const photo = useRef<Blob | null>(null);
  const menuText = useRef<string | null>(null);
  const handedIn = useRef(false);
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
  const chosenIds = useMemo(() => new Set(company.map((person) => person.id)), [company]);
  const tonightOnly = useMemo(() => new Set(tempGuests.map((guest) => guest.id)), [tempGuests]);

  // A menu handed in by the route layer is taken once, when the advisor is on.
  useEffect(() => {
    if (!mounted || !enabled || handedIn.current) return;
    if (initialMenu) {
      handedIn.current = true;
      apply({ menu: initialMenu, quality: "standard", escalated: false });
    } else if (startWithMenuText && startWithMenuText.trim() !== "") {
      handedIn.current = true;
      void runText(startWithMenuText, false);
    }
    // apply and runText are re-made every render; only the hand-in matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, enabled, initialMenu, startWithMenuText]);

  if (!mounted) return null;
  if (!enabled) {
    return (
      <div className="flex flex-col gap-4">
        <TopBack href="/matsedel">Matsedel</TopBack>
        <Notice
          action={
            <Link href="/installningar/tillval" className="inline-flex min-h-tap items-center pl-3 font-semibold underline">
              Öppna Tillval
            </Link>
          }
        >
          Menyrådgivaren är avstängd. Slå på den under Inställningar, Tillval.
        </Notice>
      </div>
    );
  }

  function setCompany(ids: string[]) {
    setSelectedIds(ids);
    writeCompanyIds(ids);
  }

  function toggle(personId: string) {
    const ids = company.map((person) => person.id);
    setCompany(ids.includes(personId) ? ids.filter((entry) => entry !== personId) : [...ids, personId]);
  }

  function addGuest(guest: Person, keep: boolean) {
    if (keep) save(guest);
    else setTempGuests((current) => [...current, guest]);
    setCompany([...company.map((person) => person.id), guest.id]);
    setGuestOpen(false);
  }

  function apply(next: MenuReading) {
    const options = recommendOptions(next.menu, company);
    setReading(next);
    setJourney({ options, choices: defaultChoices(options) });
    setMenuFor(null);
    setStage("answer");
  }

  /** A reading that failed: from the start it is a stop of its own; from the answer (Läs noggrannare) a notice there. */
  function failed(code: ErrorCode, message: string) {
    if (backStage.current !== "start") {
      setError(code === "ai_unavailable" ? "Det gick inte att läsa menyn just nu. Försök igen." : message);
      setStage(backStage.current);
      return;
    }
    const canRetry = photo.current !== null || menuText.current !== null;
    setStop(code === "ai_cap_reached" ? { kind: "cap" } : { kind: "error", message: stopMessage(code, message, photo.current !== null), canRetry });
    setStage("stop");
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
    failed(answer.error.code, answer.error.message);
  }

  async function runText(text: string, isCareful: boolean) {
    request.current?.abort();
    // A server action cannot be aborted; the controller says whether this reading is still the current one.
    const controller = new AbortController();
    request.current = controller;
    menuText.current = text;
    photo.current = null;
    setError(null);
    setCareful(isCareful);
    setView(emptyReadingView);
    setStage("reading");
    const answer = await readMenuText({ text, quality: isCareful ? "careful" : "standard" });
    if (request.current !== controller) return;
    request.current = null;
    if (answer.ok) return apply(answer.data);
    failed(answer.error.code, answer.error.message);
  }

  async function takePhoto(file: File) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    backStage.current = "start";
    photo.current = null;
    menuText.current = null;
    setError(null);
    setCareful(false);
    setView(emptyReadingView);
    setStage("reading");
    const prepared = await prepareMenuPhoto(file);
    if (request.current !== controller) return;
    request.current = null;
    if (!prepared.ok) return failed(prepared.error.code, prepared.error.message);
    photo.current = prepared.data;
    await run(prepared.data, false);
  }

  function cancel() {
    request.current?.abort();
    request.current = null;
    setStage(backStage.current);
  }

  function readAgainCarefully() {
    backStage.current = stage;
    if (photo.current) void run(photo.current, true);
    else if (menuText.current) void runText(menuText.current, true);
  }

  /** "Försök igen" on a stop: the same photo (or text) once more, as it was asked for. */
  function retry() {
    backStage.current = "start";
    if (photo.current) void run(photo.current, careful);
    else if (menuText.current) void runText(menuText.current, careful);
  }

  function pick() {
    backStage.current = "start";
    picker.current?.click();
  }

  function finish() {
    photo.current = null;
    menuText.current = null;
    setReading(null);
    setJourney({ options: [], choices: {} });
    setError(null);
    setStop(null);
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
  const totals = reading ? estimateTotalSek(journey.choices, reading.menu, company) : null;
  const drinkPerson = company.find((person) => person.id === drinkOf);
  const drinkNow = drinkPerson ? (journey.choices[drinkPerson.id]?.drink ?? drinkPerson.drink) : null;

  let content: ReactNode;
  if (showTonight) {
    content = (
      <div className="flex flex-col gap-4">
        <TopBack />
        <TonightList
          picks={tonight.picks}
          onRemove={tonight.toggle}
          onClear={tonight.clear}
          onBack={() => setShowTonight(false)}
          onNext={() => {
            setShowTonight(false);
            finish();
            pick();
          }}
        />
      </div>
    );
  } else if (stage === "reading") {
    content = <ReadingScreen view={view} careful={careful} onCancel={cancel} />;
  } else if (stage === "stop" && stop) {
    content = <StopScreen stop={stop} canRaiseCap={canRaiseCap} onBack={finish} onRetry={retry} onPhoto={pick} />;
  } else if (reading && reading.menu.ratter.length === 0 && stage !== "start") {
    content = <EmptyReading error={error} canReadCarefully={canReadCarefully} onCareful={readAgainCarefully} onPhoto={pick} onBack={finish} />;
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
  } else if (reading && totals && stage === "menu") {
    content = (
      <FullMenuScreen
        menu={reading.menu}
        company={company}
        forPerson={menuFor ? (company.find((person) => person.id === menuFor) ?? null) : null}
        totals={totals}
        isStarred={(dish) => tonight.picks.some((entry) => entry.id === pickId(reading.menu.restaurang, dish.originalnamn))}
        tonightCount={tonight.picks.length}
        reader={reader}
        canReadCarefully={canReadCarefully}
        error={error}
        onAdd={addDish}
        onStar={starDish}
        onTonight={() => setShowTonight(true)}
        onCareful={readAgainCarefully}
        onBack={finish}
        onAnswer={() => {
          setMenuFor(null);
          setStage("answer");
        }}
        onDone={() => {
          setMenuFor(null);
          setStage("choice");
        }}
        onNext={pick}
      />
    );
  } else {
    content = (
      <StartScreen
        people={everyone}
        chosenIds={chosenIds}
        tonightOnly={tonightOnly}
        onToggle={toggle}
        onAddGuest={() => setGuestOpen(true)}
        tonightCount={tonight.picks.length}
        onPhoto={pick}
        onTonight={() => setShowTonight(true)}
        slot={startSlot}
      />
    );
  }
  return (
    <>
      {content}
      <GuestSheet open={guestOpen} onClose={() => setGuestOpen(false)} onAdd={addGuest} />
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
