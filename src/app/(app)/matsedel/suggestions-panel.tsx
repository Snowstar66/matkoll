"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Badge } from "@/components/badges";
import { Button, buttonClasses } from "@/components/button";
import type { SearchIngredients } from "@/components/ingredient-picker";
import { ChoiceRows } from "@/components/choice-rows";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { addedOnDayText, clampServings, dayOptions, type DayOption } from "@/features/mealplan";
import { offerDisplay } from "@/features/offers";
import { dishEmoji, recipeMetaText } from "@/features/recipes";
import { AiSuggestions } from "@/features/recipes/ui/ai-suggestions";
import type { AddToPlan } from "@/features/recipes/ui/add-to-plan-button";
import { RecipeCard } from "@/features/recipes/ui/recipe-card";
import { useDishSuggestions } from "@/features/recipes/ui/use-dish-suggestions";
import { atHomeText, whyText, type OwnRecipeMatch } from "@/features/suggestions";
import { fail, type Result } from "@/lib/errors";


/** At most this many new AI dishes are shown. */
export const maxAiDishes = 2;

/** suggestions.ownRecipeSuggestions, passed down by the page (AD-1). */
export type SuggestionsRead = () => Promise<Result<OwnRecipeMatch[]>>;

export type SuggestionsPanelProps = {
  /** The row is open; the panel stays mounted when it is closed, so what it holds stays. */
  open: boolean;
  id: string;
  read: SuggestionsRead;
  addToPlan: AddToPlan;
  searchIngredients: SearchIngredients;
};

/**
 * What the row opens (Story 9.6): Pontus's own recipes read once, the first
 * time it is open, then at most two AI dishes on request. Kept apart from the
 * row so Matsedel loads its code only when the row is first opened.
 */
export default function SuggestionsPanel({ open, id, read, addToPlan, searchIngredients }: SuggestionsPanelProps) {
  const dishes = useDishSuggestions(null, { visible: open, mode: "offers" });
  const [recipes, setRecipes] = useState<OwnRecipeMatch[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [dayFor, setDayFor] = useState<OwnRecipeMatch | null>(null);
  const requested = useRef(false);

  // Read once, the first time the row is opened.
  useEffect(() => {
    if (!open || requested.current) return;
    requested.current = true;
    void (async () => {
      let result: Result<OwnRecipeMatch[]>;
      try {
        result = await read();
      } catch {
        result = fail("offers_unavailable");
      }
      if (result.ok) setRecipes(result.data);
      else {
        setRecipes([]);
        setFailed(true);
      }
    })();
  }, [open, read]);

  return (
    <div id={id} hidden={!open} className="flex flex-col gap-3">
      <OwnList recipes={recipes} failed={failed} onPickDay={setDayFor} />
      <AiSuggestions
        dishes={{ ...dishes, suggestions: dishes.suggestions.slice(0, maxAiDishes) }}
        searchIngredients={searchIngredients}
        addToPlan={addToPlan}
      />
      <DaySheet recipe={dayFor} addToPlan={addToPlan} onClose={() => setDayFor(null)} />
    </div>
  );
}

function OwnList({
  recipes,
  failed,
  onPickDay,
}: {
  recipes: OwnRecipeMatch[] | null;
  failed: boolean;
  onPickDay: (recipe: OwnRecipeMatch) => void;
}) {
  const headingId = useId();
  if (recipes === null) return <p className="text-meta text-ink-2">Letar bland dina recept …</p>;
  if (failed) return <Notice role="alert">Förslagen kunde inte hämtas just nu.</Notice>;
  if (recipes.length === 0)
    return (
      <p data-testid="suggestions-none" className="text-meta text-ink-2">
        Inga av dina recept passar erbjudandena eller det du har hemma just nu.
      </p>
    );
  return (
    <section aria-labelledby={headingId} data-testid="suggestion-recipes" className="flex flex-col gap-3">
      <h2 id={headingId} className="text-section-label text-ink-2">
        Från dina recept
      </h2>
      <ul className="grid gap-3 desktop:grid-cols-2">
        {recipes.map((recipe) => (
          <SuggestionCard key={recipe.id} recipe={recipe} onPickDay={() => onPickDay(recipe)} />
        ))}
      </ul>
    </section>
  );
}

function SuggestionCard({ recipe, onPickDay }: { recipe: OwnRecipeMatch; onPickDay: () => void }) {
  const offerNames = recipe.onOffer.map((label) => offerDisplay(label).title);
  return (
    <RecipeCard
      data-testid="suggestion-recipe"
      title={recipe.title}
      imageUrl={recipe.imageUrl}
      emoji={dishEmoji(recipe.title)}
      meta={recipeMetaText(recipe.totalMinutes, recipe.servings)}
      badge={recipe.isFavorite ? <Badge tone="mint">Favorit</Badge> : <Badge tone="neutral">Ditt recept</Badge>}
    >
      <p data-testid="suggestion-recipe-home" className="text-meta break-words text-ink">
        {atHomeText({ have: recipe.have, total: recipe.total })}
      </p>
      <p data-testid="suggestion-recipe-why" className="text-meta break-words text-ink-2">
        {whyText({ onOffer: recipe.onOffer.length, have: recipe.have, toBuy: recipe.toBuy })}
        {offerNames.length > 0 ? ` · Erbjudanden: ${offerNames.join(", ")}` : ""}
      </p>
      <Button onClick={onPickDay} aria-label={`Lägg på en dag: ${recipe.title}`}>
        Lägg på en dag
      </Button>
      <Link href={`/recept/${recipe.id}`} className={buttonClasses("secondary")} aria-label={`Öppna ${recipe.title}`}>
        Öppna receptet
      </Link>
    </RecipeCard>
  );
}

/**
 * "Vilken dag?": today and the rest of this week, then next week (dayOptions).
 * A tap adds the dish to that day through mealplan.addToCurrentPlan and
 * closes the sheet; one dish id per recipe is kept until it is added, so a retry
 * after a lost answer never adds it twice.
 */
function DaySheet({ recipe, addToPlan, onClose }: { recipe: OwnRecipeMatch | null; addToPlan: AddToPlan; onClose: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [adding, setAdding] = useState(false);
  const dishId = useRef<{ recipeId: string; id: string } | null>(null);
  const [options] = useState<DayOption[]>(() => dayOptions());
  const groups = [...new Set(options.map((option) => option.group))];

  async function add(option: DayOption) {
    if (!recipe || adding) return;
    setAdding(true);
    if (dishId.current?.recipeId !== recipe.id) dishId.current = { recipeId: recipe.id, id: crypto.randomUUID() };
    let result: Result<unknown>;
    try {
      result = await addToPlan({
        recipeId: recipe.id,
        servings: clampServings(recipe.servings),
        id: dishId.current.id,
        weekStart: option.weekStart,
        weekday: option.weekday,
      });
    } catch {
      result = fail("mealplan_add_failed");
    }
    setAdding(false);
    if (result.ok) {
      dishId.current = null;
      onClose();
      showToast(addedOnDayText(option.weekday));
      router.refresh();
    } else if (result.error.code === "unauthorized") router.refresh();
    else showToast(result.error.message, { role: "alert" });
  }

  return (
    <Sheet open={recipe !== null} onClose={onClose} title="Vilken dag?" subtitle={recipe?.title} closeLabel="Avbryt" preventClose={adding}>
      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <div key={group} className="flex flex-col gap-1">
            <h3 className="text-section-label text-ink-2">{group}</h3>
            <ChoiceRows
              kind="action"
              label={group}
              value={null}
              disabled={adding}
              onChange={(value) => {
                const picked = options.find((option) => `${option.weekStart}|${option.weekday}` === value);
                if (picked) void add(picked);
              }}
              options={options
                .filter((option) => option.group === group)
                .map((option) => ({ value: `${option.weekStart}|${option.weekday}`, label: option.label, testId: "suggestion-day" }))}
            />
          </div>
        ))}
      </div>
    </Sheet>
  );
}
