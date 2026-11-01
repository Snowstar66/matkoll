import type { ReactNode } from "react";
import { cx } from "@/components/cx";
import { CheckIcon, MinusIcon, RingIcon } from "@/components/icons";
import { formatQuantity, normalizeIngredientText } from "@/features/catalog";
import { atHomeText, isShort, type LineCoverage, type RecipeStatus } from "@/features/pantry";
import type { SavedRecipeLine } from "../domain/saved-recipe";
import { factorText } from "../domain/scale";

// Ingrediensrad (EXPERIENCE.md): one recipe line with its mark against the
// pantry, in the recipe view and in the step mode (Story 4.2).

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
 * on colour alone: a tick in accent when the ingredient is at home, a ring in
 * sky-ink when it is short (a vague line too, though it never counts in N), and
 * a neutral dash for a line without a catalog ingredient, which is not
 * compared with the pantry.
 */
function LineMark({ coverage }: { coverage: LineCoverage }) {
  if (coverage.kind === "covered") {
    return (
      <Mark label="finns hemma" className="text-accent">
        <CheckIcon size={18} />
      </Mark>
    );
  }
  if (coverage.kind === "unlinked") {
    return (
      <Mark label="jämförs inte med matvarorna" className="text-ink-3">
        <MinusIcon size={18} />
      </Mark>
    );
  }
  return (
    <Mark label="saknas" className="text-sky-ink">
      <RingIcon size={18} />
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

export type IngredientRowProps = {
  /** The line, its amount already scaled to the chosen servings (recipes.scaleLines). */
  line: SavedRecipeLine;
  /** The line's coverage for the chosen servings, or `null` without a status: no mark and no colour. */
  coverage: LineCoverage | null;
  /**
   * The scale factor the line's amount was scaled with: a line without a
   * catalog ingredient keeps its original text, which is never scaled, and
   * shows "×2" (recipes.factorText) when it has an amount and the factor is
   * not 1.
   */
  factor?: number;
  /** An id that makes the row focusable by script ("Saknar: …" in the recipe view takes focus here); not in the step mode, which repeats the lines. */
  anchorId?: string;
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
export function IngredientRow({ line, coverage, factor = 1, anchorId }: IngredientRowProps) {
  const name = !line.isVague ? line.ingredientName : null;
  const withAmount = !line.isVague && line.ingredientId !== null;
  const showOriginal =
    name !== null && normalizeIngredientText(line.originalText) !== normalizeIngredientText(name);
  const short = coverage !== null && coverage.kind !== "unlinked" && isShort(coverage);
  const atHome = coverage?.kind === "partial" || coverage?.kind === "other-unit" ? coverage.amounts : null;
  // Story 4.3: a calm word under the name; the ring in front already says it to screen readers.
  // Story 19.6: no extra word; the ring in front and the blue amount say it.
  const tag = null;
  const multiplier =!withAmount && !line.isVague && line.amount !== null && factor !== 1 ? factorText(factor) : null;
  return (
    <li
      id={anchorId}
      tabIndex={anchorId ? -1 : undefined}
      data-testid="recipe-view-line"
      className="flex min-h-10 items-start gap-3 border-t border-hairline py-2 outline-none first:border-t-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {coverage ? <LineMark coverage={coverage} /> : null}
      {withAmount ? (
        <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
          <span className="flex min-w-0 flex-col">
            <span className="text-item text-ink">{name ?? line.originalText}</span>
            {showOriginal ? <span className="text-meta text-ink-2">{line.originalText}</span> : null}
            {tag}
          </span>
          <span className="flex shrink-0 flex-col items-end">
            <span className={cx("text-item", short ? "text-sky-ink" : "text-ink-2")}>
              {formatQuantity(line.amount, line.unit)}
            </span>
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
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-item text-ink">{line.originalText}</span>
          {tag}
        </span>
      )}
    </li>
  );
}
