"use client";

import Link from "next/link";
import { type ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Notice } from "@/components/notice";
import { useCoarsePointer } from "@/components/use-coarse-pointer";
import type { ErrorCode } from "@/lib/errors";
import { maxMenuPages } from "@/lib/images";
import { useOption } from "@/lib/use-option";
import { fitMenuPhotos, prepareMenuPhoto, type MenuReading } from "../actions/read-menu";
import { readMenuText } from "../actions/read-menu-text";
import { defaultChoices, drinkOptions, estimateTotalSek, recommendOptions } from "../index";
import type { Choices, PersonOptions } from "../domain/options";
import { type HouseholdPerson, meId } from "../domain/people";
import type { Person } from "../domain/profile";
import { pickId } from "../domain/tonight";
import type { Menu, MenuDish } from "../domain/types";
import { dishSek } from "../domain/view";
import { AnswerScreen } from "./answer-screen";
import { readCompanyIds, writeCompanyIds } from "./company-store";
import { AddDishSheet } from "./add-dish-sheet";
import { DrinkSheet } from "./drink-sheet";
import { EmptyReading } from "./empty-reading";
import { FullMenuScreen } from "./full-menu-screen";
import {
  addDrink,
  addExtra,
  choose,
  clearDish,
  dropAllDrinks,
  dropUsualDrink,
  emptyReadingView,
  foldReading,
  hasDish,
  hasDrink,
  hasNoDrink,
  removeDrink,
  removeExtra,
  type ReadingView,
} from "./journey";
import type { AddedNote } from "./answer-screen";
import { TextLink, TopBack } from "./journey-parts";
import { type MenuPage, PagesScreen } from "./pages-screen";
import { readMenuWithFallback } from "./read-with-fallback";
import { ReadingScreen } from "./reading-screen";
import { StartScreen } from "./start-screen";
import { type MenuStop, StopScreen } from "./stop-screen";
import { TonightList } from "./tonight-list";
import { usePeople } from "./use-people";
import { useTonight } from "./use-tonight";
import { YourChoiceScreen } from "./your-choice-screen";

// Menyrådgivare (Tillval, off by default), "Tolka menyn": one thing per screen. Who eats is ticked on the start, Fota
// menyn takes the first page, "Menyns sidor" collects the rest (a menu is often several pages: one photo each, at
// most maxMenuPages), and only "Läs menyn" starts the reading: the app reads all pages live in one call
// (POST /api/menu/read?stream=1, the dishes come in one by one), proposes two or three dishes per person, you choose,
// and "Ert val" is a clean summary to show the waiter. The whole menu is the second tab of the answer. A page the
// reading could not read is named on the answer, with "Ta om". A reading that stops has a screen of its own. Kept on
// this phone: who was ticked last time, and "Ikväll" (the dishes starred in this session). The photos stay in this
// tab's memory only, until the journey ends.

type Stage = "start" | "pages" | "reading" | "answer" | "choice" | "menu" | "stop";

const noopSubscribe = () => () => {};

/** What the stop says when the reading could not be run (the dev text of ai_unavailable is not for someone at a restaurant). */
function stopMessage(code: ErrorCode, message: string, photos: number): string {
  if (code !== "ai_unavailable") return message;
  if (photos === 0) return "Menyn kunde inte läsas. Kontrollera nätet och försök igen.";
  return `Menyn kunde inte läsas. Kontrollera nätet och försök igen. ${photos === 1 ? "Fotot finns kvar." : "Sidorna finns kvar."}`;
}

/** "Sida 2", "Sida 2 och 3", "Sida 1, 2 och 4". */
function pagesPhrase(numbers: readonly number[]): string {
  if (numbers.length === 1) return `Sida ${numbers[0]}`;
  return `Sida ${numbers.slice(0, -1).join(", ")} och ${numbers[numbers.length - 1]}`;
}

/** An object URL for a thumbnail, where the browser has them. */
function thumbnailOf(photo: Blob): string | null {
  return typeof URL.createObjectURL === "function" ? URL.createObjectURL(photo) : null;
}

function letGo(page: MenuPage) {
  if (page.url && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(page.url);
}

/**
 * `members`: the household's members (read on the server), pickable as company from the start; null = not readable.
 * `startSlot`: a quiet link the route layer shows under Fota menyn on the start screen only (Sök restauranger).
 * `profiles`: the household's saved profiles (read on the server); null = not readable, so this device's own list.
 * `canRaiseCap`: the signed-in user is the app's owner, so the AI-cap stop offers "Höj taket".
 * `costText`: what a reading of that many pages costs, in words, for "Menyns sidor" (the route layer knows the prices).
 */
export function MenuAdvisor({
  members = null,
  profiles = null,
  startSlot,
  canRaiseCap = false,
  initialMenu,
  startWithMenuText,
  costText,
}: {
  members?: readonly HouseholdPerson[] | null;
  profiles?: Person[] | null;
  startSlot?: ReactNode;
  canRaiseCap?: boolean;
  /** A menu the route layer already holds: the advisor starts on its answer, with no photo and no reading. */
  initialMenu?: Menu;
  /** Plain menu text (from a restaurant's own website): the advisor reads it (readMenuText) and goes on as with a photo. `initialMenu` wins when both are given. */
  startWithMenuText?: string;
  costText?: (pages: number) => string | null;
}) {
  const enabled = useOption("menuAdvisor");
  // Off on the server and during hydration: nothing flashes for people who have it on.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const [stage, setStage] = useState<Stage>("start");
  const [careful, setCareful] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stop, setStop] = useState<MenuStop | null>(null);
  const [reading, setReading] = useState<MenuReading | null>(null);
  const [view, setView] = useState<ReadingView>(emptyReadingView);
  const [journey, setJourney] = useState<{ options: PersonOptions[]; choices: Choices }>({ options: [], choices: {} });
  // What the last "Lägg till åt" did, said under that person on the answer (never silent: added, replaced, already there, no price).
  const [added, setAdded] = useState<AddedNote | null>(null);
  const [drinkOf, setDrinkOf] = useState<string | null>(null);
  // Who the sheet "Lägg till åt" with the whole menu is open for.
  const [dishOf, setDishOf] = useState<string | null>(null);
  const [showTonight, setShowTonight] = useState(false);
  const tonight = useTonight();
  const { people } = usePeople(members, profiles);
  // Who is with tonight: ids of the household's people. It starts with whoever was ticked last time on this phone;
  // a person added since is not ticked until picked.
  const [selectedIds, setSelectedIds] = useState<string[]>(() => readCompanyIds() ?? [meId]);
  // The pages of the menu being photographed (MenuPage), in order; the ref is the truth for the async steps.
  const [pages, setPagesState] = useState<MenuPage[]>([]);
  const pagesRef = useRef<MenuPage[]>([]);
  const [pagesNotice, setPagesNotice] = useState<string | null>(null);
  const pageCount = useRef(0);
  // The page "Ta om" replaces with the next photo, when one was asked for.
  const replaceId = useRef<string | null>(null);
  // The photos of the last reading as they were sent (fitted to one request), and the pages they were: for
  // "Läs noggrannare" and "Försök igen", and to name a page the reading could not read.
  const photos = useRef<Blob[] | null>(null);
  const sentIds = useRef<string[]>([]);
  const menuText = useRef<string | null>(null);
  const handedIn = useRef(false);
  const request = useRef<AbortController | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const touch = useCoarsePointer();
  // Where a stopped or failed reading goes back to: the screen it was started from.
  const backStage = useRef<Stage>("start");

  useEffect(
    () => () => {
      request.current?.abort();
      pagesRef.current.forEach(letGo);
    },
    [],
  );

  // Never nobody: with all unticked, "Du" is with.
  const company = useMemo(() => {
    const chosen = people.filter((person) => selectedIds.includes(person.id));
    return chosen.length > 0 ? chosen : people.slice(0, 1);
  }, [people, selectedIds]);
  const chosenIds = useMemo(() => new Set(company.map((person) => person.id)), [company]);

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

  function apply(next: MenuReading) {
    // The pages the reading could not read are marked, for the answer's notice and "Ta om".
    const unreadable = new Set((next.menu.olasbara_sidor ?? []).flatMap((number) => sentIds.current[number - 1] ?? []));
    if (unreadable.size > 0) setPages(pagesRef.current.map((page) => (unreadable.has(page.id) ? { ...page, unreadable: true } : page)));
    const options = recommendOptions(next.menu, company);
    setReading(next);
    setJourney({ options, choices: defaultChoices(options) });
    setAdded(null);
    setStage("answer");
  }

  /** A reading that failed: from the start it is a stop of its own; from the answer (Läs noggrannare) a notice there. */
  function failed(code: ErrorCode, message: string) {
    if (backStage.current !== "start" && backStage.current !== "pages") {
      setError(code === "ai_unavailable" ? "Det gick inte att läsa menyn just nu. Försök igen." : message);
      setStage(backStage.current);
      return;
    }
    const canRetry = photos.current !== null || menuText.current !== null;
    setStop(code === "ai_cap_reached" ? { kind: "cap" } : { kind: "error", message: stopMessage(code, message, photos.current?.length ?? 0), canRetry });
    setStage("stop");
  }

  function setPages(next: MenuPage[]) {
    pagesRef.current = next;
    setPagesState(next);
  }

  function clearPages() {
    pagesRef.current.forEach(letGo);
    setPages([]);
    setPagesNotice(null);
    replaceId.current = null;
  }

  /** Opens the camera (a phone) or the file window (a computer) in this very tap: iOS opens no input a tap did not. */
  function openCamera() {
    (touch && camera.current ? camera : picker).current?.click();
  }

  /**
   * Photos chosen: each becomes a page (or the first replaces the page "Ta om" was for), made small one at a time.
   * Nothing is read: that waits for "Läs menyn". Photos over maxMenuPages are left out, and the notice says so.
   */
  async function addPhotos(files: File[]) {
    const target = replaceId.current;
    replaceId.current = null;
    const current = pagesRef.current;
    const replacing = target !== null && current.some((page) => page.id === target);
    const room = maxMenuPages - current.length + (replacing ? 1 : 0);
    const taken = files.slice(0, Math.max(0, room));
    const left = files.length - taken.length;
    setError(null);
    setPagesNotice(left > 0 ? `Högst ${maxMenuPages} sidor. ${left === 1 ? "En bild" : `${left} bilder`} kom inte med.` : null);
    setStage("pages");
    if (taken.length === 0) return;
    const added = taken.map((file) => {
      pageCount.current += 1;
      const page: MenuPage = { id: `page-${pageCount.current}`, status: "preparing", photo: null, url: null, message: null, unreadable: false };
      return { page, file };
    });
    const fresh = added.map((entry) => entry.page);
    if (replacing) {
      const at = current.findIndex((page) => page.id === target);
      letGo(current[at]!);
      setPages([...current.slice(0, at), fresh[0]!, ...current.slice(at + 1), ...fresh.slice(1)]);
    } else {
      setPages([...current, ...fresh]);
    }
    for (const { page, file } of added) {
      const prepared = await prepareMenuPhoto(file);
      // Removed (or the journey ended) while it was made small: nothing to show.
      if (!pagesRef.current.some((entry) => entry.id === page.id)) continue;
      const done: MenuPage = prepared.ok
        ? { ...page, status: "ready", photo: prepared.data, url: thumbnailOf(prepared.data) }
        : { ...page, status: "failed", message: prepared.error.message };
      setPages(pagesRef.current.map((entry) => (entry.id === page.id ? done : entry)));
    }
  }

  function removePage(id: string) {
    const page = pagesRef.current.find((entry) => entry.id === id);
    if (page) letGo(page);
    setPagesNotice(null);
    setPages(pagesRef.current.filter((entry) => entry.id !== id));
  }

  function movePage(id: string, step: -1 | 1) {
    const list = [...pagesRef.current];
    const at = list.findIndex((entry) => entry.id === id);
    const to = at + step;
    if (at < 0 || to < 0 || to >= list.length) return;
    [list[at], list[to]] = [list[to]!, list[at]!];
    setPages(list);
  }

  /** "Ta om": the next photo takes this page's place. */
  function retakePage(id: string) {
    replaceId.current = id;
    setStage("pages");
    openCamera();
  }

  /** "Läs menyn": every usable page, fitted to one request, read in one go. */
  async function readPages() {
    const ready = pagesRef.current.filter((page) => page.status === "ready" && page.photo !== null);
    if (ready.length === 0) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    backStage.current = "pages";
    menuText.current = null;
    setError(null);
    setCareful(false);
    setView(emptyReadingView);
    setStage("reading");
    const fitted = await fitMenuPhotos(ready.map((page) => page.photo!));
    if (request.current !== controller) return;
    request.current = null;
    if (!fitted.ok) return failed(fitted.error.code, fitted.error.message);
    photos.current = fitted.data;
    sentIds.current = ready.map((page) => page.id);
    setPages(pagesRef.current.map((page) => (page.unreadable ? { ...page, unreadable: false } : page)));
    await run(fitted.data, false);
  }

  async function run(blobs: Blob[], isCareful: boolean) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setError(null);
    setCareful(isCareful);
    setView(emptyReadingView);
    setStage("reading");
    const answer = await readMenuWithFallback(blobs, isCareful ? "careful" : "standard", controller.signal, (event) => {
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
    photos.current = null;
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

  function cancel() {
    request.current?.abort();
    request.current = null;
    setStage(backStage.current);
  }

  function readAgainCarefully() {
    backStage.current = stage;
    if (photos.current) void run(photos.current, true);
    else if (menuText.current) void runText(menuText.current, true);
  }

  /** "Försök igen" on a stop: the same pages (or text) once more, as it was asked for. */
  function retry() {
    backStage.current = photos.current ? "pages" : "start";
    if (photos.current) void run(photos.current, careful);
    else if (menuText.current) void runText(menuText.current, careful);
  }

  /** Fota menyn (and Fota om, Nästa meny): a new menu, so the pages from before go; the photo only adds a page. */
  function pick() {
    backStage.current = "start";
    clearPages();
    photos.current = null;
    openCamera();
  }

  /** "Välj från album" on the start: as pick, one or several photos from the library. */
  function pickAlbum() {
    backStage.current = "start";
    clearPages();
    photos.current = null;
    picker.current?.click();
  }

  function finish() {
    clearPages();
    photos.current = null;
    sentIds.current = [];
    menuText.current = null;
    setReading(null);
    setJourney({ options: [], choices: {} });
    setAdded(null);
    setError(null);
    setStop(null);
    setStage("start");
  }

  /**
   * "Lägg till åt Anna": the dish is added to what Anna has, whatever kind it is (the menu only grows; the soptunna
   * takes one away). A dish she already has changes nothing. The answer says what happened, under her, and says
   * so when the dish has no price (it is left out of the sum).
   */
  function addDish(personId: string, dishIndex: number) {
    const person = company.find((entry) => entry.id === personId);
    const dish = reading?.menu.ratter[dishIndex];
    if (!reading || !person || !dish) return;
    const name = dish.originalnamn;
    let text: string;
    if (hasDish(journey.choices, personId, dishIndex)) {
      text = `${person.name} har redan ${name}.`;
    } else {
      text = `${person.name} får också ${name}.${dishSek(dish) === null ? " Pris saknas, så summan ändras inte." : ""}`;
      setJourney((current) => ({ ...current, choices: addExtra(current.choices, personId, dishIndex) }));
    }
    setAdded({ personId, text });
    setStage("answer");
  }

  function starDish(dish: MenuDish) {
    if (!reading) return;
    tonight.toggle({
      id: pickId(reading.menu.restaurang, dish.originalnamn),
      name: dish.originalnamn,
      explanation: dish.forklaring,
      restaurant: reading.menu.restaurang,
      sek: dishSek(dish),
    });
  }

  const onChosen = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    // A photo only adds a page; "Läs menyn" starts the reading.
    if (files.length > 0) void addPhotos(files);
    else replaceId.current = null;
  };
  // As Förråd's Ta kort: on a phone "Fota menyn" and "Lägg till sida" open the back camera straight away (one photo,
  // the camera's own "Använd foto"), and "Välj från album" takes one or several from the library (a camera input
  // takes one photo, and a picker for several may not offer the camera on every phone). On a computer the one input
  // is the file window, several at a time. Both are always in the page and clicked in the tap itself.
  const fileInputs = (
    <>
      {touch ? (
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="menu-camera"
          className="sr-only"
          onChange={onChosen}
        />
      ) : null}
      <input
        ref={picker}
        type="file"
        accept="image/*"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        data-testid="menu-file"
        className="sr-only"
        onChange={onChosen}
      />
    </>
  );

  const canReadCarefully = reading !== null && reading.quality !== "careful";
  const unreadablePages = pages.flatMap((page, index) => (page.unreadable ? [{ id: page.id, number: index + 1 }] : []));
  const unreadableNotice =
    unreadablePages.length > 0 ? (
      <Notice
        role="alert"
        action={
          <TextLink
            data-testid="menu-retake-page"
            className="font-semibold text-sky-ink underline"
            onClick={() => (unreadablePages.length === 1 ? retakePage(unreadablePages[0]!.id) : setStage("pages"))}
          >
            {unreadablePages.length === 1 ? `Ta om sida ${unreadablePages[0]!.number}` : "Ta om sidorna"}
          </TextLink>
        }
      >
        {`${pagesPhrase(unreadablePages.map((page) => page.number))} gick inte att läsa, så rätterna där saknas.`}
      </Notice>
    ) : null;
  const readyCount = pages.filter((page) => page.status === "ready").length;
  const reader = reading?.model && reading.effort ? { model: reading.model, effort: reading.effort } : null;
  const totals = reading ? estimateTotalSek(journey.choices, reading.menu, company) : null;
  const drinkPerson = company.find((person) => person.id === drinkOf);
  const dishPerson = company.find((person) => person.id === dishOf);

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
  } else if (stage === "pages") {
    content = (
      <PagesScreen
        pages={pages}
        maxPages={maxMenuPages}
        costText={costText ? costText(Math.max(1, readyCount)) : null}
        notice={pagesNotice}
        onBack={finish}
        onAdd={() => {
          replaceId.current = null;
          openCamera();
        }}
        onAlbum={
          touch
            ? () => {
                replaceId.current = null;
                picker.current?.click();
              }
            : undefined
        }
        onRemove={removePage}
        onMove={movePage}
        onRetake={retakePage}
        onRead={() => void readPages()}
      />
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
        added={added}
        filtered={company.some((person) => person.allergies.length > 0)}
        uncertain={reading.menu.osakert}
        pagesNotice={unreadableNotice}
        reader={reader}
        canReadCarefully={canReadCarefully}
        error={error}
        onChoose={(personId, dishIndex) => {
          setAdded(null);
          setJourney((current) => ({ ...current, choices: choose(current.choices, personId, dishIndex) }));
        }}
        onRemoveExtra={(personId, dishIndex) => {
          setAdded(null);
          setJourney((current) => ({ ...current, choices: removeExtra(current.choices, personId, dishIndex) }));
        }}
        onRemoveDish={(personId) => {
          setAdded(null);
          setJourney((current) => ({ ...current, choices: clearDish(current.choices, personId) }));
        }}
        onRemoveUsualDrink={(personId) => setJourney((current) => ({ ...current, choices: dropUsualDrink(current.choices, personId) }))}
        onRemoveDrink={(personId, kind) => setJourney((current) => ({ ...current, choices: removeDrink(current.choices, personId, kind) }))}
        onAddDrink={setDrinkOf}
        onAddDish={(personId) => {
          setAdded(null);
          setDishOf(personId);
        }}
        onDone={() => {
          setAdded(null);
          setStage("choice");
        }}
        onFullMenu={() => {
          setAdded(null);
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
        onDone={finish}
        onChange={() => setStage("answer")}
      />
    );
  } else if (reading && totals && stage === "menu") {
    content = (
      <FullMenuScreen
        menu={reading.menu}
        company={company}
        totals={totals}
        isStarred={(dish) => tonight.picks.some((entry) => entry.id === pickId(reading.menu.restaurang, dish.originalnamn))}
        tonightCount={tonight.picks.length}
        reader={reader}
        canReadCarefully={canReadCarefully}
        error={error}
        hasDish={(personId, dishIndex) => hasDish(journey.choices, personId, dishIndex)}
        onAdd={addDish}
        onStar={starDish}
        onTonight={() => setShowTonight(true)}
        onCareful={readAgainCarefully}
        onAnswer={() => setStage("answer")}
        onDone={() => {
          setStage("choice");
        }}
        onNext={pick}
      />
    );
  } else {
    content = (
      <StartScreen
        people={people}
        chosenIds={chosenIds}
        onToggle={toggle}
        tonightCount={tonight.picks.length}
        onPhoto={pick}
        onAlbum={touch ? pickAlbum : undefined}
        onTonight={() => setShowTonight(true)}
        slot={startSlot}
      />
    );
  }
  return (
    <>
      {content}
      {reading && stage === "answer" && dishPerson ? (
        <AddDishSheet
          key={dishPerson.id}
          person={dishPerson}
          menu={reading.menu}
          has={(dishIndex) => hasDish(journey.choices, dishPerson.id, dishIndex)}
          onAdd={(dishIndex) => setJourney((current) => ({ ...current, choices: addExtra(current.choices, dishPerson.id, dishIndex) }))}
          onClose={() => setDishOf(null)}
        />
      ) : null}
      {reading && stage === "answer" && drinkPerson ? (
        <DrinkSheet
          key={drinkPerson.id}
          personName={drinkPerson.name}
          has={(kind) => (kind === "ingen" ? hasNoDrink(journey.choices, drinkPerson) : hasDrink(journey.choices, drinkPerson, kind))}
          options={drinkOptions(reading.menu)}
          onPick={(kind) => setJourney((current) => ({ ...current, choices: addDrink(current.choices, drinkPerson.id, kind) }))}
          onNone={() => setJourney((current) => ({ ...current, choices: dropAllDrinks(current.choices, drinkPerson.id) }))}
          onClose={() => setDrinkOf(null)}
        />
      ) : null}
      {fileInputs}
    </>
  );
}
