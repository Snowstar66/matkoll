"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, buttonClasses } from "@/components/button";
import { cx } from "@/components/cx";
import { ChevronDownIcon } from "@/components/icons";
import { RecipeImage } from "@/components/recipe-image";
import { useToast } from "@/components/toast";
import { TrashButton } from "@/components/trash-button";
import { fail, type Result } from "@/lib/errors";
import { addToStarterPack, moveStarterItem, removeFromStarterPack, setStarterNote } from "../actions/starter-recipes";
import { recipeImageSrc } from "../domain/recipe-image";
import { recipeMetaText } from "../domain/recipe-list";
import { cleanNote, starterNoteMaxChars, starterPackCap, type StarterPackEntry } from "../domain/starter-recipe";

// Startrecept for the app's owner (Inställningar → Startrecept): the pack is the owner's own
// recipes, in the order households see them, each with a short note. The owner adds a recipe here
// or from its menu (⋯ → Lägg i startpaketet), moves it, notes it and takes it out; the preview shows
// the picker exactly as a new household sees it, and copies nothing. Taking a recipe out never
// touches the copies households have made.

export const starterPreviewHref = "/recept/startrecept?forhandsvisning=1";

export function StarterPackAdmin({ entries, recipes }: { entries: StarterPackEntry[]; recipes: { id: string; title: string }[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const inPack = new Set(entries.map((entry) => entry.recipeId));
  const addable = recipes.filter((recipe) => !inPack.has(recipe.id) && recipe.title.toLowerCase().includes(query.trim().toLowerCase()));

  async function act(change: () => Promise<Result<null>>, done?: string, undo?: () => Promise<Result<null>>): Promise<boolean> {
    setBusy(true);
    let result: Result<null>;
    try {
      result = await change();
    } catch {
      result = fail("starter_pack_failed");
    }
    setBusy(false);
    if (!result.ok) {
      showToast(result.error.message, { role: "alert" });
      return false;
    }
    router.refresh();
    if (done) {
      showToast(done, undo ? { onUndo: () => void act(undo) } : undefined);
    }
    return true;
  }

  return (
    <div className="flex flex-col gap-6" data-testid="starter-admin">
      <div className="flex flex-col gap-2">
        <p className="text-body text-ink-2">
          Startrecepten är dina egna recept, som ett hushåll kan välja att lägga i sin receptlista under Recept (med Tillval Startrecept påslaget).
          Texterna kopieras precis som de är, med bild. Inget läggs till av sig självt.
        </p>
        <p className="text-meta text-ink-3">
          Du ansvarar för att du får dela texterna och bilderna. Egna recept och egna foton går bra; recept från andra sajter kan vara skyddade.
        </p>
        <Link href={starterPreviewHref} className={cx(buttonClasses("secondary"), "self-start")} data-testid="starter-admin-preview">
          Förhandsvisa som nytt hushåll
        </Link>
      </div>

      <section className="flex flex-col gap-2" aria-labelledby="starter-pack-heading">
        <h2 id="starter-pack-heading" className="mx-1 text-section-label text-ink-2 uppercase">
          I startpaketet ({entries.length} av {starterPackCap})
        </h2>
        {entries.length === 0 ? (
          <p className="rounded-lg bg-surface p-4 text-body text-ink-2">Inga recept än. Lägg till dina egna nedan, eller från ett recept: ⋯ och Lägg i startpaketet.</p>
        ) : (
          <ol className="flex flex-col gap-2" data-testid="starter-admin-list">
            {entries.map((entry, index) => (
              <PackRow
                key={entry.itemId}
                entry={entry}
                first={index === 0}
                last={index === entries.length - 1}
                busy={busy}
                onMove={(step) => void act(() => moveStarterItem(entry.itemId, step))}
                onNote={(note) => act(() => setStarterNote(entry.itemId, note), "Anteckningen är sparad.")}
                onRemove={() =>
                  void act(
                    () => removeFromStarterPack(entry.itemId),
                    `${entry.title} togs bort ur startpaketet.`,
                    () => addToStarterPack(entry.recipeId),
                  )
                }
              />
            ))}
          </ol>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="starter-add-heading">
        <h2 id="starter-add-heading" className="mx-1 text-section-label text-ink-2 uppercase">
          Lägg till från dina recept
        </h2>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Sök bland dina recept"
          aria-label="Sök bland dina recept"
          className="min-h-tap rounded-md border border-border bg-surface px-3 text-body text-ink"
        />
        <ul className="flex flex-col divide-y divide-hairline overflow-hidden rounded-lg bg-surface" data-testid="starter-admin-addable">
          {addable.slice(0, 50).map((recipe) => (
            <li key={recipe.id} className="flex min-h-tap items-center gap-3 py-1 pr-1 pl-4">
              <span className="min-w-0 flex-1 text-body text-ink wrap-break-word">{recipe.title}</span>
              <Button
                variant="compact"
                disabled={busy || entries.length >= starterPackCap}
                onClick={() => void act(() => addToStarterPack(recipe.id), `${recipe.title} ligger nu i startpaketet.`)}
                aria-label={`Lägg ${recipe.title} i startpaketet`}
              >
                Lägg till
              </Button>
            </li>
          ))}
          {addable.length === 0 ? <li className="p-4 text-body text-ink-3">{query ? "Inget recept matchar." : "Alla dina recept ligger i startpaketet."}</li> : null}
        </ul>
      </section>
    </div>
  );
}

function PackRow({
  entry,
  first,
  last,
  busy,
  onMove,
  onNote,
  onRemove,
}: {
  entry: StarterPackEntry;
  first: boolean;
  last: boolean;
  busy: boolean;
  onMove: (step: -1 | 1) => void;
  onNote: (note: string) => Promise<boolean>;
  onRemove: () => void;
}) {
  const [note, setNote] = useState(entry.note ?? "");
  const changed = (cleanNote(note) ?? null) !== entry.note;
  const tooLong = cleanNote(note) === undefined;
  const src = recipeImageSrc({ id: entry.recipeId, imagePath: entry.imagePath, imageUrl: entry.imageUrl }, "thumb");
  return (
    <li className="flex flex-col gap-2 rounded-lg bg-surface p-3" data-testid="starter-admin-row">
      <div className="flex items-start gap-3">
        <RecipeImage src={src} title={entry.title} artSize={28} className="size-12 shrink-0 rounded-sm" />
        <div className="flex min-w-0 flex-1 flex-col">
          <Link href={`/recept/${entry.recipeId}`} className="text-body font-semibold text-ink wrap-break-word">
            {entry.title}
          </Link>
          <span className="text-meta text-ink-3">
            {recipeMetaText(entry.totalMinutes, entry.servings)} · {entry.copies === 1 ? "1 hushåll har lagt till det" : `${entry.copies} hushåll har lagt till det`}
          </span>
        </div>
        <div className="flex shrink-0">
          <button
            type="button"
            aria-label={`Flytta upp ${entry.title}`}
            disabled={first || busy}
            onClick={() => onMove(-1)}
            className="flex size-tap items-center justify-center rounded-full text-ink-2 disabled:opacity-30"
          >
            <ChevronDownIcon size={20} className="rotate-180" />
          </button>
          <button
            type="button"
            aria-label={`Flytta ned ${entry.title}`}
            disabled={last || busy}
            onClick={() => onMove(1)}
            className="flex size-tap items-center justify-center rounded-full text-ink-2 disabled:opacity-30"
          >
            <ChevronDownIcon size={20} />
          </button>
          <TrashButton label={`Ta bort ${entry.title} ur startpaketet`} onPress={onRemove} disabled={busy} />
        </div>
      </div>
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!tooLong) void onNote(note);
        }}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-meta text-ink-2">Kort anteckning (visas under titeln)</span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={starterNoteMaxChars + 20}
            className="min-h-tap rounded-md border border-border bg-bg px-3 text-body text-ink"
            aria-invalid={tooLong || undefined}
          />
        </label>
        <Button type="submit" variant="compact" disabled={!changed || tooLong || busy}>
          Spara
        </Button>
      </form>
      {tooLong ? <p className="text-meta text-danger">Högst {starterNoteMaxChars} tecken.</p> : null}
    </li>
  );
}
