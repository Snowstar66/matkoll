"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { formatPortions } from "@/components/stepper";
import { useToast } from "@/components/toast";
import { fail, type Result } from "@/lib/errors";
import { deletePlan } from "../actions/delete-plan";
import { reusePlan } from "../actions/reuse-plan";
import {
  deletePlanQuestion,
  dishCountText,
  leftOutText,
  noDishesText,
  nothingToReuseText,
  planDateText,
  planDeletedText,
  type PlanDetail,
} from "../domain/meal-plan";
import { useCreatePlan } from "./use-create-plan";

// An earlier meal plan (FR-14): its dishes and servings, read only. A dish
// whose recipe is deleted shows "Borttaget recept: [titel]" and does not come
// along with "Använd igen" (a note above the button says how many), which
// makes a new current plan of the rest and lands on Matsedel. Without a dish
// whose recipe is left, "Använd igen" is unavailable and the note says why.
// "Ta bort matsedel" asks first ("Ta bort Vecka 42? Det går inte att
// ångra.", focus on "Avbryt") and then deletes the plan for good; a plan
// already gone counts as deleted.

export type PreviousPlanProps = {
  /** An earlier plan with its dishes in order (mealplan.getPlan). */
  plan: PlanDetail;
};

export function PreviousPlan({ plan }: PreviousPlanProps) {
  const { creating, error: createError, run: reuse } = useCreatePlan((id) => reusePlan(plan.id, id));
  const [asking, setAsking] = useState(false);
  const [deleting, startDeleting] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const router = useRouter();
  const { showToast } = useToast();
  /** Set from the tap until the answer, before React has rendered `deleting`. */
  const deleteInFlight = useRef(false);
  const noteId = useId();
  const busy = creating || deleting;
  const reusable = plan.recipes.filter((dish) => dish.recipeId !== null).length;
  const leftOut = leftOutText(plan.recipes.length - reusable);
  const reuseNote = plan.recipes.length === 0 ? null : reusable === 0 ? nothingToReuseText : leftOut;

  function ask() {
    setDeleteError(null);
    setAsking(true);
  }

  function remove() {
    if (deleteInFlight.current) return;
    deleteInFlight.current = true;
    setDeleteError(null);
    startDeleting(async () => {
      try {
        let result: Result<{ id: string }>;
        try {
          result = await deletePlan(plan.id);
        } catch {
          result = fail("mealplan_delete_failed");
        }
        if (!result.ok) {
          if (result.error.code === "unauthorized") router.refresh();
          else setDeleteError(result.error.message);
          return;
        }
        // Navigate first, in the same transition as the action's revalidated
        // page, so the gone plan's "Sidan finns inte." never shows. Replace, so
        // "back" never leads to it either.
        router.replace("/matsedel/tidigare");
        setAsking(false);
        showToast(planDeletedText);
      } finally {
        deleteInFlight.current = false;
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-meta text-ink-3">
        {dishCountText(plan.recipes.length)} · skapad {planDateText(plan.createdAt)}
      </p>
      {plan.recipes.length === 0 ? (
        <p id={noteId} className="text-body text-ink-2">
          {noDishesText}
        </p>
      ) : (
        <ul aria-label="Rätter" className="flex flex-col gap-3">
          {plan.recipes.map((dish) => (
            <li key={dish.id} data-testid="previous-dish" className="flex flex-col gap-1 rounded-lg bg-surface p-3">
              {dish.recipeId ? (
                <Link
                  href={`/recept/${dish.recipeId}`}
                  className="line-clamp-2 self-start text-row-title break-words text-ink"
                >
                  {dish.recipeTitle}
                </Link>
              ) : (
                <p className="line-clamp-2 text-row-title break-words text-ink-2">
                  Borttaget recept: {dish.recipeTitle}
                </p>
              )}
              <p className="text-meta text-ink-3">{formatPortions(dish.servings)}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2">
        {reuseNote ? (
          <p id={noteId} data-testid="reuse-note" className="text-meta text-ink-2">
            {reuseNote}
          </p>
        ) : null}
        {createError ? <Notice role="alert">{createError}</Notice> : null}
        <Button
          fullWidth
          disabled={busy || reusable === 0}
          aria-describedby={reuseNote || plan.recipes.length === 0 ? noteId : undefined}
          onClick={reuse}
        >
          {creating ? "Skapar …" : "Använd igen"}
        </Button>
        <Button variant="text" disabled={busy} onClick={ask} className="self-start -ml-3">
          Ta bort matsedel
        </Button>
      </div>
      <Sheet
        open={asking}
        onClose={() => setAsking(false)}
        title="Ta bort matsedel"
        closeLabel="Avbryt"
        initialFocus="close"
        preventClose={deleting}
        footer={
          <>
            {deleteError ? <Notice role="alert">{deleteError}</Notice> : null}
            <Button fullWidth disabled={deleting} onClick={remove}>
              {deleting ? "Tar bort …" : "Ta bort"}
            </Button>
          </>
        }
      >
        <p className="text-body text-ink">{deletePlanQuestion(plan.name)}</p>
      </Sheet>
    </div>
  );
}
