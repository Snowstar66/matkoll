import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/components/cx";
import { CheckIcon, ChevronLeftIcon, MinusIcon, RingIcon } from "@/components/icons";
import { formatQuantity, normalizeIngredientText } from "@/features/catalog";
import { atHomeText, isShort, type LineCoverage, type RecipeStatus } from "@/features/pantry";
import { recipeMetaText } from "../domain/recipe-list";
import type { SavedRecipe, SavedRecipeLine } from "../domain/saved-recipe";
import { sourceLabel } from "../domain/source-label";
import { FavoriteButton } from "./favorite-button";
import { RecipeImage } from "./recipe-image";
import { RecipeStatusBadge } from "./recipe-status-badge";

// Receptvy (FR-20, the base): the same look whatever the source, with the
// heart (FR-9) and the menu (⋯, Story 1.11) beside the title, the status
// against the pantry under the meta line, and a tick or ring on every
// ingredient (Story 2.4). The portion selector, "X av Y hemma" and the
// buttons arrive in later stories.

export type RecipeViewProps = {
  recipe: SavedRecipe;
  /**
   * The recipe's status against the pantry for its own servings, with each
   * line's coverage by line id; `null` when the pantry could not be read, and
   * the recipe is shown without badge and marks.
   */
  status: RecipeStatus | null;
  /** The menu (⋯) with "Ändra", from the page, which has what its form needs. */
  menu?: ReactNode;
};

export function RecipeView({ recipe, status, menu }: RecipeViewProps) {
  const source = sourceLabel(recipe.sourceKind, recipe.sourceUrl);
  return (
    <article className="flex flex-col gap-6 pb-gutter">
      <div className="relative -mx-page desktop:mx-0 desktop:mt-10">
        <RecipeImage src={recipe.imageUrl} className="h-[260px] desktop:rounded-lg" />
        {/* On desktop the side menu is always there, so no back link. */}
        <Link
          href="/recept"
          scroll={false}
          aria-label="Tillbaka till recepten"
          className="absolute top-[max(var(--header-top-mobile),calc(env(safe-area-inset-top)+12px))] left-page flex size-tap items-center justify-center rounded-full bg-surface text-ink desktop:hidden"
        >
          <ChevronLeftIcon size={20} />
        </Link>
      </div>

      <header className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <h1 className="min-w-0 text-recipe-title break-words text-ink">{recipe.title}</h1>
          <div className="-mt-1 -mr-2.5 flex shrink-0">
            <FavoriteButton id={recipe.id} isFavorite={recipe.isFavorite} />
            {menu}
          </div>
        </div>
        <p className="text-meta text-ink-2" data-testid="recipe-meta">
          {recipeMetaText(recipe.totalMinutes, recipe.servings)}
        </p>
        {status ? <RecipeStatusBadge missingCount={status.missingCount} /> : null}
        <p className="text-meta text-ink-2">
          Källa:{" "}
          {recipe.sourceKind === "url" && recipe.sourceUrl ? (
            <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent underline">
              {source}
            </a>
          ) : (
            source
          )}
        </p>
      </header>

      {/* Mobile: ingredients above the steps. Desktop: side by side. */}
      <div className="flex flex-col gap-6 desktop:grid desktop:grid-cols-[2fr_3fr] desktop:items-start">
        <section aria-labelledby="ingredienser" className="flex flex-col gap-1 rounded-lg bg-surface px-4 py-3">
          <h2 id="ingredienser" className="text-section-label text-ink-2">
            Ingredienser
          </h2>
          {recipe.lines.length > 0 ? (
            <ul className="flex flex-col">
              {recipe.lines.map((line) => (
                <IngredientRow key={line.id} line={line} coverage={status ? lineCoverage(status, line.id) : null} />
              ))}
            </ul>
          ) : (
            <p className="py-2 text-body text-ink-2">Receptet har inga ingredienser.</p>
          )}
        </section>

        <section aria-labelledby="steg" className="flex flex-col gap-3">
          <h2 id="steg" className="text-section-label text-ink-2">
            Steg
          </h2>
          {recipe.steps.length > 0 ? (
            <ol className="flex flex-col gap-4">
              {recipe.steps.map((step, index) => (
                <li key={step.id} className="flex gap-3">
                  <span aria-hidden="true" className="w-6 shrink-0 text-row-title text-accent">
                    {index + 1}
                  </span>
                  <p className="text-body text-ink">{step.text}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-body text-ink-2">Receptet har inga steg.</p>
          )}
        </section>
      </div>
    </article>
  );
}

/**
 * The line's coverage. recipeStatus gives every line one, so a missing entry
 * is a bug: it is logged, and the line is shown neutrally.
 */
function lineCoverage(status: RecipeStatus, lineId: string): LineCoverage {
  const coverage = status.lines[lineId];
  if (coverage) return coverage;
  console.error("recipe_line_status_missing", { lineId });
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
      <Mark label="jämförs inte med lagret" className="text-ink-3">
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

/**
 * A line with a catalog ingredient and an amount shows the name and "1,5 dl",
 * and under them the original text when it says more than the name ("Lök,
 * finhackad" for Rödlök); without the ingredient's name, the original text
 * and the amount. A vague line, or one without an ingredient, shows its
 * original text. The mark in front says whether the ingredient is at home;
 * a short amount is in sky-ink, with what is at home under it when there is
 * some ("hemma: 2 dl, 1 l"). Without a status (`coverage` null) there is no
 * mark and no colour.
 */
function IngredientRow({ line, coverage }: { line: SavedRecipeLine; coverage: LineCoverage | null }) {
  const name = !line.isVague ? line.ingredientName : null;
  const withAmount = !line.isVague && line.ingredientId !== null;
  const showOriginal =
    name !== null && normalizeIngredientText(line.originalText) !== normalizeIngredientText(name);
  const short = coverage !== null && coverage.kind !== "unlinked" && isShort(coverage);
  const atHome = coverage?.kind === "partial" || coverage?.kind === "other-unit" ? coverage.amounts : null;
  return (
    <li
      data-testid="recipe-view-line"
      className="flex min-h-10 items-start gap-3 border-t border-hairline py-2 first:border-t-0"
    >
      {coverage ? <LineMark coverage={coverage} /> : null}
      {withAmount ? (
        <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
          <span className="flex min-w-0 flex-col">
            <span className="text-body text-ink">{name ?? line.originalText}</span>
            {showOriginal ? <span className="text-meta text-ink-2">{line.originalText}</span> : null}
          </span>
          <span className="flex shrink-0 flex-col items-end">
            <span className={cx("text-body", short ? "text-sky-ink" : "text-ink-2")}>
              {formatQuantity(line.amount, line.unit)}
            </span>
            {atHome ? <span className="text-meta text-ink-2">{atHomeText(atHome)}</span> : null}
          </span>
        </span>
      ) : (
        <span className="min-w-0 flex-1 text-body text-ink">{line.originalText}</span>
      )}
    </li>
  );
}
