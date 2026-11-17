"use client";

import { type ReactNode, useEffect, useState } from "react";
import { AmountInput } from "@/components/amount-input";
import { Chip } from "@/components/chip";
import { cx } from "@/components/cx";
import { CartIcon, CheckIcon, MinusIcon, RingIcon } from "@/components/icons";
import { formatQuantity, normalizeIngredientText, type IngredientSearchHit } from "@/features/catalog";
import { atHomeText, isShort, type LineCoverage, type RecipeStatus } from "@/features/pantry";
import type { SavedRecipeLine } from "../domain/saved-recipe";
import { offerLineText, type LineState } from "../domain/line-status";
import { factorText } from "../domain/scale";
import { replacedFromName } from "../domain/struck-lines";

// Ingrediensrad (EXPERIENCE.md): one recipe line with its mark against the
// pantry, in the recipe view (Story 25.1: with "Saknas" / "På listan" and the offer on the row).

/** Lines whose missing coverage is logged already: once per line, not on every render. */
const loggedMissing = new Set<string>();

/**
 * The line's coverage. recipeStatus gives every line one, so a missing entry
 * is a bug: it is logged once per line, and the line is shown neutrally.
 */
export function lineCoverage(status: RecipeStatus, lineId: string): LineCoverage {
  const coverage = status.lines[lineId];
  if (coverage) return coverage;
  if (!loggedMissing.has(lineId)) {
    loggedMissing.add(lineId);
    console.error("recipe_line_status_missing", { lineId });
  }
  return { kind: "unlinked" };
}

/**
 * The line's mark, with a name for screen readers, since status never rests
 * on colour alone: a tick in accent when the ingredient is at home, an orange
 * ring when it is missing, a blue cart when it stands on the shopping list, and
 * a neutral dash for a line that is not compared with the pantry (no catalog
 * ingredient, or a vague line).
 */
function LineMark({ state, coverage }: { state: LineState | null; coverage: LineCoverage }) {
  if (state?.kind === "missing") {
    return (
      <Mark label="saknas" className="text-sky-ink">
        <RingIcon size={18} />
      </Mark>
    );
  }
  if (state?.kind === "listed") {
    return (
      <Mark label="på inköpslistan" className="text-sky-ink">
        <CartIcon size={18} />
      </Mark>
    );
  }
  if (coverage.kind === "covered") {
    // A staple (Basvaror) is at home by the household's own list, not by the pantry.
    return (
      <Mark label={coverage.staple ? "basvara, finns hemma" : "finns hemma"} className="text-accent">
        <CheckIcon size={18} />
      </Mark>
    );
  }
  return (
    <Mark label="jämförs inte med matvarorna" className="text-ink-3">
      <MinusIcon size={18} />
    </Mark>
  );
}

function Mark({ label, className, children }: { label: string; className: string; children: ReactNode }) {
  return (
    <span role="img" aria-label={label} className={cx("flex h-6 w-5 shrink-0 items-center justify-center", className)}>
      {children}
    </span>
  );
}

/**
 * Stryk ingrediens: what a tap on the row does. A tap opens the row and its two chips, "Ändra mängd" and "Stryk"
 * (only "Stryk" for a row without an amount); a struck row has "Ta tillbaka". Without an editor the row is not
 * pressable (another household's recipe, which can only be looked at).
 */
export type LineEditor = {
  /** The two chips are shown under the row. */
  open: boolean;
  /** The amount is a number field with Spara and Avbryt. */
  editingAmount: boolean;
  /** Byt ut: the name is a text field with suggestions from the catalog. */
  replacing: boolean;
  /** A change is being saved: the chips wait. */
  busy: boolean;
  onToggle: () => void;
  onStartAmount: () => void;
  /** The text typed in the number field ("1,5"). */
  onSaveAmount: (typed: string) => void;
  onCancel: () => void;
  onStrike: () => void;
  onRestore: () => void;
  onStartReplace: () => void;
  /** The name typed or picked; the amount and unit stay. */
  onReplace: (name: string) => void;
  /** "Ta tillbaka" on a replaced line: puts back what it was. */
  onUndoReplace: () => void;
  /** Catalog suggestions for what is typed (catalog.searchIngredients); an empty list on failure. */
  search: (query: string) => Promise<IngredientSearchHit[]>;
};

export type IngredientRowProps = {
  /** The line, its amount already scaled to the chosen servings (recipes.scaleLines). */
  line: SavedRecipeLine;
  /** The line's coverage for the chosen servings, or `null` without a status: no mark and no colour. */
  coverage: LineCoverage | null;
  /** What the row says (hemma, Saknas, På listan) and its offer (recipes.lineStates); left out without a status. */
  state?: LineState | null;
  /**
   * The scale factor the line's amount was scaled with: a line without a
   * catalog ingredient keeps its original text, which is never scaled, and
   * shows "×2" (recipes.factorText) when it has an amount and the factor is
   * not 1.
   */
  factor?: number;
  /** An id that makes the row focusable by script ("Saknar: …" in the recipe view takes focus here); not in the step mode, which repeats the lines. */
  anchorId?: string;
  /** Stryk ingrediens: makes the row pressable; left out, the row only shows. */
  editor?: LineEditor;
};

/**
 * A line with a catalog ingredient and an amount shows the name and "1,5 dl",
 * and under them the original text when it says more than the name ("Lök,
 * finhackad" for Rödlök); without the ingredient's name, the original text
 * and the amount. A vague line, or one without an ingredient, shows its
 * original text; one without an ingredient but with an amount also shows the
 * factor ("×2") when the servings differ from the recipe's (decision
 * 2026-10-26). The mark in front says whether the ingredient is at home; a
 * short amount is in sky-ink, with what is at home under it when there is
 * some ("hemma: 2 dl, 1 l"). Amounts are rounded only by formatQuantity, never
 * to whole pieces (AD-7, AD-12).
 */
export function IngredientRow({ line, coverage, state = null, factor = 1, anchorId, editor }: IngredientRowProps) {
  const name = !line.isVague ? line.ingredientName : null;
  const withAmount = !line.isVague && line.ingredientId !== null;
  const showOriginal =
    name !== null && normalizeIngredientText(line.originalText) !== normalizeIngredientText(name);
  const short = coverage !== null && coverage.kind !== "unlinked" && isShort(coverage);
  const missing = state?.kind === "missing";
  // UX-06: only "På listan" is said in words; the blue ring and "2 av 12 hemma" already say what is missing.
  const statusWord = state?.kind === "listed" ? "På listan" : null;
  const offer = state?.offer ?? null;
  const atHome = coverage?.kind === "partial" || coverage?.kind === "other-unit" ? coverage.amounts : null;
  // Story 4.3: a calm word under the name; the ring in front already says it to screen readers.
  // Story 19.6: no extra word; the ring in front and the blue amount say it.
  const tag = null;
  const multiplier =!withAmount && !line.isVague && line.amount !== null && factor !== 1 ? factorText(factor) : null;
  const struck = line.isStruck === true;
  // Byt ut: what the line was, in grey under the new name.
  const replacedNote = line.replacedFrom ? <span className="text-meta text-ink-3" data-testid="recipe-line-replaced">i stället för {replacedFromName(line.replacedFrom)}</span> : null;
  const mark = coverage ? <LineMark state={state} coverage={coverage} /> : null;
  const rowClass = "flex w-full items-start gap-3";
  const inner = (
    <>
      {mark}
      {withAmount ? (
        <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
          <span className="flex min-w-0 flex-col">
            <span className={cx("text-item text-ink", missing && "font-semibold")}>{name ?? line.originalText}</span>
            {showOriginal ? <span className="text-meta text-ink-2">{line.originalText}</span> : null}
            {replacedNote}
            {offer ? (
              <span className="text-meta text-deal-ink" data-testid="recipe-line-offer">
                {offerLineText(offer)}
              </span>
            ) : null}
            {tag}
          </span>
          <span className="flex shrink-0 flex-col items-end">
            <span className={cx("text-item", short ? "text-sky-ink" : "text-ink-2")}>
              {formatQuantity(line.amount, line.unit)}
            </span>
            {statusWord ? (
              <span className="text-meta font-semibold text-sky-ink" data-testid="recipe-line-status">
                {statusWord}
              </span>
            ) : null}
            {atHome ? <span className="text-meta text-ink-2">{atHomeText(atHome)}</span> : null}
          </span>
        </span>
      ) : multiplier ? (
        <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
          <span className="flex min-w-0 flex-col">
            <span className="text-item text-ink">{line.originalText}</span>
            {tag}
          </span>
          <span className="shrink-0 text-item text-ink-2">{multiplier}</span>
        </span>
      ) : (
        <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
          <span className="flex min-w-0 flex-col">
            <span className={cx("text-item text-ink", missing && "font-semibold")}>{line.originalText}</span>
            {replacedNote}
            {tag}
          </span>
          {statusWord ? (
            <span className="shrink-0 text-meta font-semibold text-sky-ink" data-testid="recipe-line-status">
              {statusWord}
            </span>
          ) : null}
        </span>
      )}
    </>
  );
  return (
    <li
      id={anchorId}
      tabIndex={anchorId ? -1 : undefined}
      data-testid="recipe-view-line"
      data-struck={struck ? "" : undefined}
      className={cx(
        "flex min-h-10 flex-col border-t border-hairline py-2 outline-none first:border-t-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        editor?.open && "rounded-md bg-mint/40",
      )}
    >
      {struck ? (
        <StruckRow line={line} editor={editor} />
      ) : editor ? (
        <button type="button" aria-expanded={editor.open} onClick={editor.onToggle} className={cx(rowClass, "rounded-md text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent")}>
          {inner}
        </button>
      ) : (
        <div className={rowClass}>{inner}</div>
      )}
      {editor?.open && !struck ? <LineChips line={line} editor={editor} canEditAmount={withAmount} /> : null}
    </li>
  );
}

/** The suggestions and the field behind "Byt ut": type a name or tap a suggestion. */
function ReplaceField({ line, editor }: { line: SavedRecipeLine; editor: LineEditor }) {
  const [typed, setTyped] = useState("");
  const [hits, setHits] = useState<IngredientSearchHit[]>([]);
  useEffect(() => {
    const query = typed.trim();
    if (query.length < 2) return;
    let current = true;
    const timer = setTimeout(() => {
      void editor.search(query).then((found) => {
        if (current) setHits(found.slice(0, 6));
      });
    }, 200);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [typed, editor]);
  const name = typed.trim();
  // Suggestions only for a name long enough to search with.
  const shown = name.length < 2 ? [] : hits;
  return (
    <div className="flex flex-col gap-2 pt-2 pl-8">
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (name) editor.onReplace(name);
        }}
      >
        <input
          id={`line-replace-${line.id}`}
          type="text"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="Byt till, till exempel persilja"
          aria-label="Byt till"
          autoFocus
          maxLength={80}
          autoComplete="off"
          className="h-10 min-w-0 flex-1 rounded-md border-2 border-accent bg-fill px-3 text-item text-ink outline-none"
        />
        <Chip action selected={false} type="submit" disabled={editor.busy || name === ""}>
          Byt
        </Chip>
        <Chip action selected={false} onClick={editor.onCancel} disabled={editor.busy}>
          Avbryt
        </Chip>
      </form>
      <p className="text-meta text-ink-2">Mängden ({formatQuantity(line.amount, line.unit)}) följer med.</p>
      {shown.length > 0 ? (
        <ul aria-label="Förslag" className="flex flex-col">
          {shown.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                disabled={editor.busy}
                onClick={() => editor.onReplace(hit.name)}
                className="flex min-h-tap w-full items-center border-t border-hairline py-2 text-left text-item text-ink outline-none focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
              >
                {hit.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The two chips under an open row, or the number field that replaces them. */
function LineChips({ line, editor, canEditAmount }: { line: SavedRecipeLine; editor: LineEditor; canEditAmount: boolean }) {
  const [typed, setTyped] = useState(() => formatQuantity(line.amount, null));
  if (editor.replacing) return <ReplaceField line={line} editor={editor} />;
  if (editor.editingAmount) {
    return (
      <form
        className="flex items-center gap-2 pt-2 pl-8"
        onSubmit={(event) => {
          event.preventDefault();
          editor.onSaveAmount(typed);
        }}
      >
        <AmountInput
          id={`line-amount-${line.id}`}
          value={typed}
          onChange={setTyped}
          stepper={false}
          onStep={() => {}}
          canStepDown={false}
          canStepUp={false}
          unit={line.unit ?? undefined}
          autoFocus
          maxLength={12}
        />
        <Chip action selected={false} type="submit" disabled={editor.busy}>
          Spara
        </Chip>
        <Chip action selected={false} onClick={editor.onCancel} disabled={editor.busy}>
          Avbryt
        </Chip>
      </form>
    );
  }
  return (
    <div className="flex gap-2 pt-2 pl-8">
      {canEditAmount ? (
        <Chip action selected={false} onClick={editor.onStartAmount} disabled={editor.busy}>
          Ändra mängd
        </Chip>
      ) : null}
      <Chip action selected={false} onClick={editor.onStartReplace} disabled={editor.busy}>
        Byt ut
      </Chip>
      <Chip action selected={false} onClick={editor.onStrike} disabled={editor.busy}>
        Stryk
      </Chip>
      {line.replacedFrom ? (
        <Chip action selected={false} onClick={editor.onUndoReplace} disabled={editor.busy}>
          Ta tillbaka
        </Chip>
      ) : null}
    </div>
  );
}

/** A struck line: grey and struck through, with the grey dash in front (it is not compared with the pantry), and "Ta tillbaka". */
function StruckRow({ line, editor }: { line: SavedRecipeLine; editor: LineEditor | undefined }) {
  const withAmount = !line.isVague && line.ingredientId !== null;
  const name = withAmount ? (line.ingredientName ?? line.originalText) : line.originalText;
  const showOriginal = withAmount && line.ingredientName !== null && normalizeIngredientText(line.originalText) !== normalizeIngredientText(line.ingredientName);
  return (
    <>
      <div className="flex w-full items-start gap-3">
        <Mark label="struken, jämförs inte med matvarorna" className="text-ink-3">
          <MinusIcon size={18} />
        </Mark>
        <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3 text-ink-3 line-through">
          <span className="flex min-w-0 flex-col">
            <span className="text-item">{name}</span>
            {showOriginal ? <span className="text-meta">{line.originalText}</span> : null}
          </span>
          {withAmount ? <span className="shrink-0 text-item">{formatQuantity(line.amount, line.unit)}</span> : null}
        </span>
      </div>
      {editor ? (
        <button
          type="button"
          disabled={editor.busy}
          onClick={editor.onRestore}
          className="flex min-h-tap items-center self-start pl-8 text-control text-accent outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
        >
          Ta tillbaka
        </button>
      ) : null}
    </>
  );
}
