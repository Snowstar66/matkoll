"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Badge } from "@/components/badges";
import { Button, buttonClasses } from "@/components/button";
import { useToast } from "@/components/toast";
import { addedToPlanText, clampServings } from "@/features/mealplan";
import { offerDisplay } from "@/features/offers";
import { atHomeText, whyText, type OwnRecipeMatch } from "@/features/suggestions";
import { fail, type Result } from "@/lib/errors";
import type { AddToPlan } from "./add-to-plan-button";
import { dishEmoji } from "../domain/dish-emoji";
import { recipeMetaText } from "../domain/recipe-list";
import { RecipeCard } from "./recipe-card";

// "Från dina recept" (Story 16.3): Pontus's own recipes that use this week's
// offers, shown first in the suggestions from the offers, at once and without
// the AI. Nothing is shown when no recipe matches, and nothing says so.

/** suggestions.ownRecipesWithOffers, passed down by the page (AD-1). */
export type OwnRecipesRead = (storeId?: string) => Promise<Result<OwnRecipeMatch[]>>;

export type OwnRecipesProps = {
  read: OwnRecipesRead;
  /** The store the offers are from; none is the selected store. */
  storeId: string | null;
  /** mealplan.addToCurrentPlan from the page (AD-1). */
  addToPlan?: AddToPlan;
};

export function OwnRecipes({ read, storeId, addToPlan }: OwnRecipesProps) {
  const headingId = useId();
  const [shown, setShown] = useState<{ storeId: string | null; recipes: OwnRecipeMatch[] } | null>(null);

  useEffect(() => {
    let current = true;
    void (async () => {
      let result: Result<OwnRecipeMatch[]>;
      try {
        result = await read(storeId ?? undefined);
      } catch {
        result = fail("offers_unavailable");
      }
      // A failure shows nothing: the AI's dishes come as before.
      if (current) setShown({ storeId, recipes: result.ok ? result.data : [] });
    })();
    return () => {
      current = false;
    };
  }, [read, storeId]);

  if (!shown || shown.storeId !== storeId || shown.recipes.length === 0) return null;
  return (
    <section aria-labelledby={headingId} data-testid="own-recipes" className="flex flex-col gap-3">
      <h2 id={headingId} className="text-section-label text-ink-2">
        Från dina recept
      </h2>
      <ul className="grid gap-3 desktop:grid-cols-2">
        {shown.recipes.map((recipe) => (
          <OwnRecipeCard key={recipe.id} recipe={recipe} addToPlan={addToPlan} />
        ))}
      </ul>
    </section>
  );
}

function OwnRecipeCard({ recipe, addToPlan }: { recipe: OwnRecipeMatch; addToPlan?: AddToPlan }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [adding, setAdding] = useState(false);
  /** The dish id of the tap on its way, kept until it is added, so a retry after a lost answer adds one dish. */
  const dishId = useRef<string | null>(null);
  const offerNames = recipe.onOffer.map((label) => offerDisplay(label).title);

  async function add() {
    if (!addToPlan || adding) return;
    setAdding(true);
    const id = (dishId.current ??= crypto.randomUUID());
    let result: Result<unknown>;
    try {
      result = await addToPlan({ recipeId: recipe.id, servings: clampServings(recipe.servings), id });
    } catch {
      result = fail("mealplan_add_failed");
    }
    setAdding(false);
    if (result.ok) {
      dishId.current = null;
      showToast(addedToPlanText, { show: { label: "Visa inköpslistan", onShow: () => router.push("/lista") } });
    } else if (result.error.code === "unauthorized") router.refresh();
    else showToast(result.error.message, { role: "alert" });
  }

  return (
    <RecipeCard
      data-testid="own-recipe"
      title={recipe.title}
      imageUrl={recipe.imageUrl}
      emoji={dishEmoji(recipe.title)}
      meta={recipeMetaText(recipe.totalMinutes, recipe.servings)}
      badge={recipe.isFavorite ? <Badge tone="mint">Favorit</Badge> : <Badge tone="neutral">Ditt recept</Badge>}
    >
      <p data-testid="own-recipe-why" className="text-meta break-words text-ink">
        {whyText({ onOffer: recipe.onOffer.length, have: recipe.have, toBuy: recipe.toBuy })}
      </p>
      <p className="text-meta break-words text-ink-2">
        {atHomeText({ have: recipe.have, total: recipe.total })} · Erbjudanden: {offerNames.join(", ")}
      </p>
      {addToPlan ? (
        <Button onClick={() => void add()} disabled={adding} aria-label={`Lägg på matsedeln: ${recipe.title}`}>
          Lägg på matsedeln
        </Button>
      ) : null}
      <Link href={`/recept/${recipe.id}`} className={buttonClasses("secondary")} aria-label={`Öppna ${recipe.title}`}>
        Öppna receptet
      </Link>
    </RecipeCard>
  );
}
