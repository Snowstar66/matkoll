"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/button";
import { useToast } from "@/components/toast";
import { addedToPlanText, clampServings } from "@/features/mealplan";
import { fail, type Result } from "@/lib/errors";

/** mealplan.addToCurrentPlan, passed down by the page (AD-1). */
export type AddToPlan = (input: { recipeId: string; servings?: number; id: string }) => Promise<Result<unknown>>;

export type AddToPlanButtonProps = {
  recipeId: string;
  addToPlan: AddToPlan;
  /** The servings shown in the recipe view, which the dish gets (FR-13). */
  servings: number;
};

/**
 * "Lägg på matsedeln" (FR-13): the recipe view's primary button, in its Fast
 * åtgärdsknapp. A tap adds the recipe to the current meal plan with the
 * servings shown (within 1–1000, as a dish allows), and a short confirmation
 * says "Lagt på matsedeln."; a tap again adds it once more. A failure is a short
 * confirmation announced as an alert; an expired session refreshes the page,
 * which sends Pontus to sign in.
 */
export function AddToPlanButton({ recipeId, addToPlan, servings }: AddToPlanButtonProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [adding, setAdding] = useState(false);
  /**
   * The dish id for this tap and the servings it was sent with, kept until
   * the dish is added, so trying again after a lost answer never adds it
   * twice; a tap after a success, or with other servings, is a new dish.
   */
  const pending = useRef<{ id: string; servings: number } | null>(null);

  async function add() {
    if (adding) return;
    setAdding(true);
    const sent = clampServings(servings);
    if (pending.current?.servings !== sent) pending.current = { id: crypto.randomUUID(), servings: sent };
    let result: Result<unknown>;
    try {
      result = await addToPlan({ recipeId, servings: sent, id: pending.current.id });
    } catch {
      result = fail("mealplan_add_failed");
    }
    setAdding(false);
    if (result.ok) {
      pending.current = null;
      showToast(addedToPlanText);
    } else if (result.error.code === "unauthorized") router.refresh();
    else showToast(result.error.message, { role: "alert" });
  }

  return (
    <Button fullWidth disabled={adding} onClick={add}>
      {adding ? "Lägger på matsedeln …" : "Lägg på matsedeln"}
    </Button>
  );
}
