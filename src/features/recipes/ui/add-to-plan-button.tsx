"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/button";
import { FixedAction } from "@/components/fixed-action";
import { useToast } from "@/components/toast";
import { addedToPlanText } from "@/features/mealplan";
import { fail, type Result } from "@/lib/errors";

/** mealplan.addToCurrentPlan, passed down by the page (AD-1). */
export type AddToPlan = (input: { recipeId: string; id: string }) => Promise<Result<unknown>>;

/**
 * "Lägg på matsedeln" (FR-13): the recipe view's primary button, pinned to the
 * bottom (Fast åtgärdsknapp). A tap adds the recipe to the current meal plan
 * with its own servings, and a short confirmation says "Lagt på
 * matsedeln."; a tap again adds it once more. A failure is a short
 * confirmation announced as an alert; an expired session refreshes the page,
 * which sends Pontus to sign in.
 */
export function AddToPlanButton({ recipeId, addToPlan }: { recipeId: string; addToPlan: AddToPlan }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [adding, setAdding] = useState(false);
  /**
   * The dish id for this tap, kept until the dish is added, so trying again
   * after a lost answer never adds it twice; a tap after a success is a new dish.
   */
  const pendingId = useRef<string | null>(null);

  async function add() {
    if (adding) return;
    setAdding(true);
    pendingId.current ??= crypto.randomUUID();
    let result: Result<unknown>;
    try {
      result = await addToPlan({ recipeId, id: pendingId.current });
    } catch {
      result = fail("mealplan_add_failed");
    }
    setAdding(false);
    if (result.ok) {
      pendingId.current = null;
      showToast(addedToPlanText);
    } else if (result.error.code === "unauthorized") router.refresh();
    else showToast(result.error.message, { role: "alert" });
  }

  return (
    <FixedAction>
      <Button fullWidth disabled={adding} onClick={add}>
        {adding ? "Lägger på matsedeln …" : "Lägg på matsedeln"}
      </Button>
    </FixedAction>
  );
}
