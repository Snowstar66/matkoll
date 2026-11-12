"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chip, ChipRow } from "@/components/chip";
import { useConfirmDelete } from "@/components/confirm-delete";
import { cx } from "@/components/cx";
import { CheckIcon, GlobeIcon, InfoIcon, RecipesIcon, SlidersIcon } from "@/components/icons";
import { Meter } from "@/components/meter";
import { Notice } from "@/components/notice";
import { PreferenceNotes } from "@/components/preference-notes";
import { RecipeImage } from "@/components/recipe-image";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { TrashButton } from "@/components/trash-button";
import { errorMessages } from "@/lib/errors";
import { useOption } from "@/lib/use-option";
import { copyStarterRecipe, readStarterPreview, refreshAfterStarterCopies, removeStarterCopies, type StarterPreview } from "../actions/starter-recipes";
import { recipeCategoryLabels } from "../domain/recipe-category";
import { recipeMetaText } from "../domain/recipe-list";
import {
  addButtonText,
  addedTitle,
  allAddedText,
  allChosen,
  availableItems,
  brokenText,
  chosenText,
  continueText,
  filterStarterItems,
  fullText,
  keepText,
  pickerSubText,
  removeCopiesText,
  removedText,
  roomLeft,
  roomNoticeText,
  selectAll,
  selectAllText,
  selectionLimit,
  starterFilters,
  starterUndoMs,
  type StarterFilter,
  type StarterItem,
  type StarterRoom,
} from "../domain/starter-recipe";
import {
  StarterBack,
  StarterButton,
  StarterButtonLink,
  StarterFooter,
  StarterScreen,
  StarterStop,
  StarterTextButton,
  StarterTextLink,
  StarterTitle,
} from "./starter-parts";

// Kom igång med recept (the sketch of 2026-11-11, decided by Pontus): a household CHOOSES pack recipes
// and they are copied into its own list, one at a time, texts exactly as written. The five steps:
// the picker (Steg 2), the preview of one recipe (Steg 3), the copying (Steg 4) and Klart (Steg 5);
// Steg 1 is on Recept (starter-offer.tsx). Each stop has a screen of its own: no connection, the
// list is full, everything is added already, nothing chosen (the grey button), and the switch is off.
// The owner's preview (`preview`) shows the pack as a new household sees it and copies nothing.

type Added = { item: StarterItem; recipeId: string };

type Phase =
  | { kind: "pick" }
  | { kind: "adding"; list: StarterItem[]; done: Added[]; currentId: string | null; asking: boolean; stopping: boolean }
  | { kind: "broken"; done: Added[]; rest: StarterItem[]; failed: StarterItem[] }
  | { kind: "done"; added: Added[]; failed: StarterItem[]; capped: boolean };

export type StarterPickerProps = {
  /** The pack as the picker shows it; `null` when it could not be read. */
  items: StarterItem[] | null;
  room: StarterRoom;
  /** The household's untouched starter copies, for "Ta bort startrecepten". */
  untouchedCopies: number;
  /** The owner's preview: as a new household sees it, and nothing is copied. */
  preview?: boolean;
};

export function StarterPicker({ items: given, room, untouchedCopies, preview = false }: StarterPickerProps) {
  const router = useRouter();
  const on = useOption("starterRecipes");
  const { showToast } = useToast();
  const { requestDelete, dialog } = useConfirmDelete();
  const [phase, setPhase] = useState<Phase>({ kind: "pick" });
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState<StarterFilter>("all");
  const [opened, setOpened] = useState<StarterItem | null>(null);
  /** Copies made on this page, by item, until the server's list says so too. */
  const [madeHere, setMadeHere] = useState<Record<string, string>>({});
  const [madeCount, setMadeCount] = useState(0);
  const stop = useRef(false);

  const items = useMemo(
    () => (given ?? []).map((item) => (item.copyId === null && madeHere[item.itemId] ? { ...item, copyId: madeHere[item.itemId]! } : item)),
    [given, madeHere],
  );
  const currentRoom = useMemo(() => ({ ...room, count: room.count + madeCount }), [room, madeCount]);

  // Focus goes to each new screen's title, so a screen reader hears where it is.
  useEffect(() => {
    document.querySelector<HTMLElement>("[data-testid^='starter-'] h1")?.focus({ preventScroll: true });
  }, [phase.kind]);

  async function run(queue: StarterItem[], doneBefore: Added[]) {
    const done = [...doneBefore];
    const failed: StarterItem[] = [];
    const list = [...doneBefore.map((entry) => entry.item), ...queue];
    stop.current = false;
    setPhase({ kind: "adding", list, done: [...done], currentId: queue[0]?.itemId ?? null, asking: false, stopping: false });
    for (let index = 0; index < queue.length; index++) {
      const item = queue[index]!;
      setPhase((current) => (current.kind === "adding" ? { ...current, currentId: item.itemId } : current));
      let result: Awaited<ReturnType<typeof copyStarterRecipe>>;
      try {
        result = await copyStarterRecipe(item.itemId);
      } catch {
        // The connection broke (or the server did not answer): what is added stays, and says so.
        setPhase({ kind: "broken", done, rest: queue.slice(index), failed });
        return;
      }
      if (result.ok) {
        done.push({ item, recipeId: result.data.id });
        setMadeHere((made) => ({ ...made, [item.itemId]: result.data.id }));
        if (result.data.added) setMadeCount((count) => count + 1);
      } else if (result.error.code === "recipe_starter_cap") {
        finish(done, failed, true);
        return;
      } else if (result.error.code === "unauthorized") {
        router.refresh();
        return;
      } else {
        failed.push(item);
      }
      setPhase((current) => (current.kind === "adding" ? { ...current, done: [...done] } : current));
      if (stop.current) break;
    }
    finish(done, failed, false);
  }

  function finish(added: Added[], failed: StarterItem[], capped: boolean) {
    setSelected([]);
    setPhase({ kind: "done", added, failed, capped });
    // Recept, Matsedel and Inköpslista read the new recipes; a lost answer only means they are read later.
    void refreshAfterStarterCopies().catch(() => {});
  }

  function start() {
    if (preview) {
      showToast("Förhandsvisning: inget kopieras.");
      return;
    }
    const queue = items.filter((item) => selected.includes(item.itemId) && item.copyId === null);
    if (queue.length === 0) return;
    void run(queue, []);
  }

  function removeUntouched() {
    requestDelete({
      question: `Ta bort ${untouchedCopies} startrecept?`,
      detail: "Bara startrecept som ni inte har ändrat, gjort till favorit, delat eller lagt på matsedeln tas bort. Era egna recept rörs inte.",
      onConfirm: async () => {
        let message: string;
        try {
          const result = await removeStarterCopies();
          message = result.ok ? `${result.data.removed.length} startrecept borttagna.` : result.error.message;
        } catch {
          message = errorMessages.recipe_starter_remove_failed;
        }
        setMadeHere({});
        setMadeCount(0);
        showToast(message);
        router.refresh();
      },
    });
  }

  const removeButton =
    untouchedCopies > 0 && !preview ? (
      <StarterTextButton onClick={removeUntouched} data-testid="starter-remove-copies">
        {removeCopiesText(untouchedCopies)}
      </StarterTextButton>
    ) : null;

  if (phase.kind === "adding") {
    return (
      <AddingScreen
        phase={phase}
        onAsk={(asking) => setPhase((current) => (current.kind === "adding" ? { ...current, asking } : current))}
        onStop={() => {
          stop.current = true;
          setPhase((current) => (current.kind === "adding" ? { ...current, asking: false, stopping: true } : current));
        }}
      />
    );
  }
  if (phase.kind === "broken") {
    const total = phase.done.length + phase.rest.length;
    return (
      <StarterScreen testId="starter-broken">
        <StarterBack />
        <StarterStop icon={<GlobeIcon size={34} />} tone={phase.done.length > 0 ? "sand" : "sky"} title={phase.done.length > 0 ? "Anslutningen bröts" : "Kunde inte lägga till recepten"}>
          {brokenText(phase.done.length, total)}
        </StarterStop>
        <StarterFooter>
          <StarterButton onClick={() => void run(phase.rest, phase.done)}>{phase.done.length > 0 ? continueText(phase.rest.length) : "Försök igen"}</StarterButton>
          {phase.done.length > 0 ? (
            <StarterTextButton onClick={() => finish(phase.done, phase.failed, false)}>{keepText(phase.done.length)}</StarterTextButton>
          ) : (
            <StarterTextLink href="/recept">Till Recept</StarterTextLink>
          )}
        </StarterFooter>
      </StarterScreen>
    );
  }
  if (phase.kind === "done") {
    const more = availableItems(items).length > 0 && roomLeft(currentRoom) > 0;
    return (
      <DoneScreen
        phase={phase}
        more={more}
        onMore={() => {
          setFilter("all");
          setPhase({ kind: "pick" });
          router.refresh();
        }}
      />
    );
  }

  // The stops before anything is chosen.
  if (given === null) {
    return (
      <StarterScreen testId="starter-unavailable">
        <StarterBack href="/recept" />
        <StarterStop icon={<GlobeIcon size={34} />} tone="sky" title="Kunde inte hämta recepten">
          Det behövs internet för att hämta recept och bilder. Inget har lagts till.
        </StarterStop>
        <StarterFooter>
          <StarterButton onClick={() => router.refresh()}>Försök igen</StarterButton>
          <StarterTextLink href="/recept">Till Recept</StarterTextLink>
        </StarterFooter>
      </StarterScreen>
    );
  }
  if (!on && !preview) {
    return (
      <StarterScreen testId="starter-off">
        <StarterBack href="/recept" />
        <StarterStop icon={<SlidersIcon size={34} />} title="Startrecept är avstängt">
          Slå på Startrecept under Inställningar, Tillval, så kan du välja bland färdiga vardagsrätter.
        </StarterStop>
        <StarterFooter>
          <StarterButtonLink href="/installningar/tillval">Till Tillval</StarterButtonLink>
          <StarterTextLink href="/recept">Till Recept</StarterTextLink>
        </StarterFooter>
      </StarterScreen>
    );
  }
  if (items.length === 0) {
    return (
      <StarterScreen testId="starter-empty">
        <StarterBack href="/recept" />
        <StarterStop icon={<RecipesIcon size={34} />} title="Inga startrecept än">
          Det finns inga startrecept att välja bland just nu.
        </StarterStop>
        <StarterFooter>
          <StarterButtonLink href="/recept">Till Recept</StarterButtonLink>
        </StarterFooter>
      </StarterScreen>
    );
  }
  const available = availableItems(items);
  if (available.length === 0) {
    return (
      <StarterScreen testId="starter-all-added">
        {dialog}
        <StarterBack href="/recept" />
        <StarterStop icon={<CheckIcon size={34} />} title="Ni har redan alla startrecept">
          {allAddedText(items.length)}
        </StarterStop>
        <StarterFooter>
          <StarterButtonLink href="/recept">Till Recept</StarterButtonLink>
          {removeButton}
        </StarterFooter>
      </StarterScreen>
    );
  }
  if (roomLeft(currentRoom) === 0) {
    return (
      <StarterScreen testId="starter-full">
        <StarterBack href="/recept" />
        <StarterStop icon={<RecipesIcon size={34} />} tone="sand" title="Receptlistan är full">
          {fullText(currentRoom)}
        </StarterStop>
        <StarterFooter>
          <StarterButtonLink href="/recept">Till Recept</StarterButtonLink>
        </StarterFooter>
      </StarterScreen>
    );
  }

  const limit = selectionLimit(items, currentRoom);
  const capped = limit < available.length;
  const chips = starterFilters(items);
  const shown = filterStarterItems(items, filter);
  const filterLabel = filter === "all" ? null : (chips.find((chip) => chip.id === filter)?.label ?? null);
  const shownOpen = shown.filter((item) => item.copyId === null);
  const everything = allChosen(shown, selected, limit);
  const added = items.length - available.length;

  function toggle(item: StarterItem) {
    if (item.copyId !== null) return;
    setSelected((current) =>
      current.includes(item.itemId) ? current.filter((id) => id !== item.itemId) : current.length >= limit ? current : [...current, item.itemId],
    );
  }

  return (
    <StarterScreen testId="starter-picker">
      {dialog}
      <StarterBack href="/recept" />
      <StarterTitle sub={pickerSubText(items.length, added, filterLabel, shown.length)}>Startrecept</StarterTitle>
      {preview ? (
        <Notice role="status">Förhandsvisning: så ser ett nytt hushåll startrecepten. Inget kopieras.</Notice>
      ) : null}
      {capped ? (
        <p className="flex gap-2 rounded-md bg-sand p-3 text-body text-sand-ink" data-testid="starter-room">
          <InfoIcon size={20} className="mt-px shrink-0" />
          <span>{roomNoticeText(currentRoom)}</span>
        </p>
      ) : null}
      <ChipRow aria-label="Visa" data-testid="starter-filters">
        {chips.map((chip) => (
          <Chip key={chip.id} selected={filter === chip.id} aria-pressed={filter === chip.id} count={chip.count} onClick={() => setFilter(chip.id)}>
            {chip.label}
          </Chip>
        ))}
      </ChipRow>
      <div className="flex items-center justify-between gap-3">
        <span className="text-body font-semibold text-ink" data-testid="starter-count" aria-live="polite">
          {chosenText(selected.length, limit, capped && selected.length >= limit)}
        </span>
        {shownOpen.length > 0 ? (
          <button
            type="button"
            className={cx("min-h-tap rounded-md px-2 text-body font-medium text-accent", selected.length === 0 && "underline underline-offset-4")}
            onClick={() => setSelected(everything ? [] : selectAll(shown, selected, limit))}
          >
            {everything ? "Rensa" : selectAllText(Math.min(shownOpen.length, limit), filter !== "all")}
          </button>
        ) : null}
      </div>
      <ul className="grid grid-cols-2 gap-3 desktop:grid-cols-3" data-testid="starter-grid">
        {shown.map((item) => (
          <StarterCard
            key={item.itemId}
            item={item}
            chosen={selected.includes(item.itemId)}
            blocked={item.copyId === null && !selected.includes(item.itemId) && selected.length >= limit}
            onToggle={() => toggle(item)}
            onOpen={() => setOpened(item)}
          />
        ))}
      </ul>
      {removeButton ? <div className="flex justify-center">{removeButton}</div> : null}
      <StarterFooter>
        <StarterButton disabled={selected.length === 0} onClick={start} data-testid="starter-add">
          {addButtonText(selected.length)}
        </StarterButton>
        {selected.length === 0 ? <p className="pb-1 text-meta text-ink-3">Tryck på ett recept för att välja det.</p> : null}
      </StarterFooter>
      <PreviewSheet
        item={opened}
        chosen={opened ? selected.includes(opened.itemId) : false}
        canChoose={opened ? opened.copyId === null && (selected.includes(opened.itemId) || selected.length < limit) : false}
        onToggle={() => opened && toggle(opened)}
        onClose={() => setOpened(null)}
      />
    </StarterScreen>
  );
}

/** One pack recipe in the picker: the image and title open it, the circle chooses it. Added ones are dimmed with "Finns redan". */
function StarterCard({ item, chosen, blocked, onToggle, onOpen }: { item: StarterItem; chosen: boolean; blocked: boolean; onToggle: () => void; onOpen: () => void }) {
  const exists = item.copyId !== null;
  const allergy = item.fit.filter((note) => note.kind === "allergy");
  return (
    <li
      data-testid="starter-card"
      data-chosen={chosen ? "true" : undefined}
      className={cx(
        "relative flex min-w-0 flex-col overflow-hidden rounded-lg border-2 bg-surface",
        chosen ? "border-accent" : "border-transparent",
        (exists || blocked) && "opacity-55",
      )}
    >
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-col text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent">
        <RecipeImage src={item.imageSrc} title={item.title} artSize={72} className="h-[104px] w-full desktop:h-[160px]" />
        <span className="flex min-w-0 flex-col gap-0.5 px-3 pt-2 pb-3">
          <span className="line-clamp-2 text-[0.9375rem]/5 font-semibold wrap-break-word text-ink">{item.title}</span>
          <span className="text-[0.8125rem]/[18px] text-ink-3">{recipeMetaText(item.totalMinutes, item.servings)}</span>
          {item.note ? <span className="line-clamp-2 text-[0.8125rem]/[18px] text-ink-2">{item.note}</span> : null}
          <PreferenceNotes notes={allergy} max={1} />
        </span>
      </button>
      {exists ? (
        <span className="absolute top-2 left-2 rounded-pill bg-surface px-2 py-0.5 text-meta font-semibold text-ink-2">Finns redan</span>
      ) : null}
      <button
        type="button"
        role="checkbox"
        aria-checked={chosen}
        aria-label={`Välj ${item.title}`}
        disabled={exists || blocked}
        onClick={onToggle}
        className="absolute top-0 right-0 flex size-tap items-center justify-center disabled:cursor-not-allowed"
      >
        <span
          className={cx(
            "flex size-7 items-center justify-center rounded-full border-2 shadow-sm",
            chosen || exists ? "border-accent bg-accent text-on-accent" : "border-white bg-black/25",
          )}
        >
          {chosen || exists ? <CheckIcon size={16} /> : null}
        </span>
      </button>
    </li>
  );
}

/** Steg 3: one pack recipe opened before it is chosen, its texts exactly as written. Nothing is copied. */
function PreviewSheet({ item, chosen, canChoose, onToggle, onClose }: { item: StarterItem | null; chosen: boolean; canChoose: boolean; onToggle: () => void; onClose: () => void }) {
  const [loaded, setLoaded] = useState<{ itemId: string; preview: StarterPreview | null; failed: boolean } | null>(null);
  const itemId = item?.itemId ?? null;

  useEffect(() => {
    if (!itemId) return;
    let live = true;
    readStarterPreview(itemId)
      .then((result) => {
        if (live) setLoaded({ itemId, preview: result.ok ? result.data : null, failed: !result.ok });
      })
      .catch(() => {
        if (live) setLoaded({ itemId, preview: null, failed: true });
      });
    return () => {
      live = false;
    };
  }, [itemId]);

  const preview = loaded && loaded.itemId === itemId ? loaded.preview : null;
  const failed = loaded?.itemId === itemId && loaded.failed;
  const exists = item?.copyId !== null && item !== null;
  return (
    <Sheet
      open={item !== null}
      onClose={onClose}
      title={item?.title ?? "Startrecept"}
      closeLabel="Klar"
      initialFocus="title"
      footer={
        item ? (
          <div className="flex flex-col items-center gap-1">
            {exists ? (
              <StarterButton disabled>Finns redan i er lista</StarterButton>
            ) : chosen ? (
              <button
                type="button"
                onClick={onToggle}
                className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-pill border border-accent bg-surface px-6 text-headline font-semibold text-accent"
              >
                <CheckIcon size={20} />
                Vald. Ta bort ur valet
              </button>
            ) : (
              <StarterButton onClick={onToggle} disabled={!canChoose}>
                Välj det här receptet
              </StarterButton>
            )}
            <StarterTextButton onClick={onClose}>Stäng</StarterTextButton>
          </div>
        ) : null
      }
    >
      {item ? (
        <div className="flex flex-col gap-4" data-testid="starter-preview">
          <RecipeImage src={preview?.imageSrc ?? item.imageSrc} title={item.title} artSize={120} className="aspect-[4/3] w-full rounded-lg" />
          <p className="flex gap-2 text-body text-ink">
            <b>{recipeMetaText(item.totalMinutes, item.servings)}</b>
          </p>
          {item.categories.length > 0 || item.fit.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {item.categories.map((category) => (
                <span key={category} className="rounded-pill bg-fill px-2.5 py-0.5 text-meta text-ink-2">
                  {recipeCategoryLabels[category]}
                </span>
              ))}
            </div>
          ) : null}
          <PreferenceNotes notes={item.fit} />
          {item.note ? <p className="text-body text-ink-2">{item.note}</p> : null}
          {failed ? (
            <Notice role="alert">{errorMessages.recipe_starter_unavailable}</Notice>
          ) : preview ? (
            <>
              <section className="flex flex-col gap-1">
                <h3 className="text-section-label text-ink-2 uppercase">Ingredienser</h3>
                <ul className="flex flex-col gap-1 text-body text-ink">
                  {preview.lines.map((line, index) => (
                    <li key={index}>
                      {line.group && (index === 0 || preview.lines[index - 1]?.group !== line.group) ? (
                        <span className="mt-2 block text-meta font-semibold text-ink-2">{line.group}</span>
                      ) : null}
                      {line.text}
                    </li>
                  ))}
                </ul>
              </section>
              <section className="flex flex-col gap-1">
                <h3 className="text-section-label text-ink-2 uppercase">Steg</h3>
                <ol className="flex flex-col gap-2 text-body text-ink">
                  {preview.steps.map((step, index) => (
                    <li key={index} className="flex gap-2">
                      <span className="font-semibold text-ink-2">{index + 1}.</span>
                      <span className="min-w-0 wrap-break-word">
                        {step.title ? <b className="block">{step.title}</b> : null}
                        {step.text}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
              {preview.sourceUrl ? (
                <a href={preview.sourceUrl} target="_blank" rel="noreferrer noopener" className="text-meta text-accent underline underline-offset-4">
                  Receptets källa
                </a>
              ) : null}
            </>
          ) : (
            <p className="text-body text-ink-3">Hämtar receptet …</p>
          )}
        </div>
      ) : null}
    </Sheet>
  );
}

/** Steg 4: the copying, row by row, with Avbryt (stops after the one under way; what is added stays). */
function AddingScreen({ phase, onAsk, onStop }: { phase: Extract<Phase, { kind: "adding" }>; onAsk: (asking: boolean) => void; onStop: () => void }) {
  const doneIds = new Set(phase.done.map((entry) => entry.item.itemId));
  return (
    <StarterScreen testId="starter-adding">
      <StarterBack />
      <StarterTitle sub="Bilder och recept kopieras till er lista.">Lägger till recepten</StarterTitle>
      <div className="flex flex-col gap-2" aria-live="polite">
        <p className="text-[1.75rem] leading-8 font-bold text-ink" data-testid="starter-progress">
          {phase.done.length} av {phase.list.length}
        </p>
        <Meter value={phase.list.length === 0 ? 0 : phase.done.length / phase.list.length} />
      </div>
      {phase.asking ? (
        <p className="flex gap-2 rounded-md bg-sand p-3 text-body text-sand-ink">
          <InfoIcon size={20} className="mt-px shrink-0" />
          <span>Avbryter efter receptet som kopieras nu. {phase.done.length > 0 ? `De ${phase.done.length} som är klara ligger kvar i er lista.` : "Inget tas bort."}</span>
        </p>
      ) : null}
      {phase.stopping ? <p className="text-body text-ink-2">Avbryter efter det här receptet …</p> : null}
      <ul className="flex flex-col gap-2" data-testid="starter-queue">
        {phase.list.map((item) => (
          <QueueRow key={item.itemId} item={item} state={doneIds.has(item.itemId) ? "done" : item.itemId === phase.currentId ? "busy" : "waiting"} />
        ))}
      </ul>
      <StarterFooter>
        {phase.asking ? (
          <>
            <StarterButton onClick={() => onAsk(false)}>Fortsätt</StarterButton>
            <StarterTextButton onClick={onStop}>Avbryt ändå</StarterTextButton>
          </>
        ) : (
          <StarterTextButton onClick={() => onAsk(true)} disabled={phase.stopping}>
            Avbryt
          </StarterTextButton>
        )}
      </StarterFooter>
    </StarterScreen>
  );
}

function QueueRow({ item, state }: { item: StarterItem; state: "done" | "busy" | "waiting" }) {
  return (
    <li className="flex items-center gap-3 rounded-md bg-surface p-2">
      <RecipeImage src={item.imageSrc} title={item.title} artSize={28} className="size-11 shrink-0 rounded-sm" />
      <span className="min-w-0 flex-1 text-body text-ink wrap-break-word">{item.title}</span>
      {state === "done" ? (
        <span role="img" aria-label="Klar" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
          <CheckIcon size={16} />
        </span>
      ) : (
        <span
          role="img"
          aria-label={state === "busy" ? "Kopieras" : "Väntar"}
          className={cx("size-6 shrink-0 rounded-full border-[2.5px]", state === "busy" ? "animate-spin border-accent border-t-transparent motion-reduce:animate-none" : "border-border")}
        />
      )}
    </li>
  );
}

/** Steg 5: what was added, each with a bin (at once, with Ångra for 6 seconds), and the way on. */
function DoneScreen({ phase, more, onMore }: { phase: Extract<Phase, { kind: "done" }>; more: boolean; onMore: () => void }) {
  const { showToast } = useToast();
  const [hidden, setHidden] = useState<string[]>([]);
  const shown = phase.added.filter((entry) => !hidden.includes(entry.recipeId));

  function remove(entry: Added) {
    setHidden((current) => [...current, entry.recipeId]);
    let undone = false;
    showToast(removedText(entry.item.title), {
      durationMs: starterUndoMs,
      onUndo: () => {
        undone = true;
        setHidden((current) => current.filter((id) => id !== entry.recipeId));
      },
      onClose: () => {
        if (undone) return;
        void removeStarterCopies([entry.recipeId])
          .then((result) => {
            if (result.ok && result.data.removed.includes(entry.recipeId)) return;
            setHidden((current) => current.filter((id) => id !== entry.recipeId));
            showToast(result.ok ? "Receptet har ändrats och togs inte bort." : result.error.message, { role: "alert" });
          })
          .catch(() => {
            setHidden((current) => current.filter((id) => id !== entry.recipeId));
            showToast(errorMessages.recipe_starter_remove_failed, { role: "alert" });
          });
      },
    });
  }

  return (
    <StarterScreen testId="starter-done">
      <StarterBack />
      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        <span aria-hidden="true" className="flex size-15 items-center justify-center rounded-full bg-mint text-mint-ink">
          <CheckIcon size={30} />
        </span>
        <h1 tabIndex={-1} className="text-section-title font-bold text-ink outline-none">
          {addedTitle(shown.length)}
        </h1>
        <p className="max-w-[32ch] text-body text-ink-2">De ligger i er receptlista och går att ändra som alla andra recept.</p>
      </div>
      {phase.capped ? <Notice role="status">Receptlistan blev full, så resten lades inte till.</Notice> : null}
      {phase.failed.length > 0 ? (
        <Notice role="status">
          {phase.failed.length === 1 ? `${phase.failed[0]!.title} gick inte att lägga till.` : `${phase.failed.length} recept gick inte att lägga till.`}
        </Notice>
      ) : null}
      <ul className="flex flex-col gap-2" data-testid="starter-added">
        {shown.map((entry) => (
          <li key={entry.recipeId} className="flex items-center gap-3 rounded-md bg-surface py-1 pl-2">
            <RecipeImage src={entry.item.imageSrc} title={entry.item.title} artSize={28} className="size-11 shrink-0 rounded-sm" />
            <Link href={`/recept/${entry.recipeId}`} className="min-w-0 flex-1 text-body text-ink wrap-break-word">
              {entry.item.title}
            </Link>
            <TrashButton label={`Ta bort ${entry.item.title}`} onPress={() => remove(entry)} />
          </li>
        ))}
      </ul>
      <StarterFooter>
        <StarterButtonLink href="/recept">Visa i Recept</StarterButtonLink>
        {more ? <StarterTextButton onClick={onMore}>Välj fler startrecept</StarterTextButton> : null}
      </StarterFooter>
    </StarterScreen>
  );
}
