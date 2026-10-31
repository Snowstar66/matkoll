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
import { copyPlan } from "../actions/copy-plan";
import { deletePlan } from "../actions/delete-plan";
import {
  deletePlanQuestion,
  leftOutText,
  noDishesText,
  nothingToCopyText,
  planDeletedText,
  planSummaryText,
  weekdayNames,
  type PlanDetail,
} from "../domain/meal-plan";
import { copiedText, copyTargets, weekQuery, type WeekChoice } from "../domain/week";

// An earlier meal plan (FR-14): its dishes and servings, read only. A dish
// whose recipe is deleted shows "Borttaget recept: [titel]" and does not come
// along with "Kopiera till …" (a note above the button says how many). Without
// a dish whose recipe is left, "Kopiera till …" is unavailable and the note
// says why.
// "Ta bort matsedel" asks first ("Ta bort Vecka 42? Det går inte att
// ångra.", focus on "Avbryt") and then deletes the plan for good; a plan
// already gone counts as deleted.

export type PreviousPlanProps = {
  /** An earlier plan with its dishes in order (mealplan.getPlan). */
  plan: PlanDetail;
};

export function PreviousPlan({ plan }: PreviousPlanProps) {
    const [asking, setAsking] = useState(false);
  const [deleting, startDeleting] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [copyBusy, startCopying] = useTransition();
  const [copyError, setCopyError] = useState<string | null>(null);
  const copyInFlight = useRef(false);
  const router = useRouter();
  const { showToast } = useToast();
  /** Set from the tap until the answer, before React has rendered `deleting`. */
  const deleteInFlight = useRef(false);
  const noteId = useId();
  const busy = deleting || copyBusy;
  const reusable = plan.recipes.filter((dish) => dish.recipeId !== null).length;
  const leftOut = leftOutText(plan.recipes.length - reusable);
  const copyNote = plan.recipes.length === 0 ? null : reusable === 0 ? nothingToCopyText : leftOut;

  function ask() {
    setDeleteError(null);
    setAsking(true);
  }

  function copyTo(target: WeekChoice) {
    if (copyInFlight.current) return;
    copyInFlight.current = true;
    setCopyError(null);
    startCopying(async () => {
      try {
        let result: Result<{ copied: number }>;
        try {
          result = await copyPlan(plan.id, target.weekStart);
        } catch {
          result = fail("mealplan_copy_failed");
        }
        if (!result.ok) {
          if (result.error.code === "unauthorized") router.refresh();
          else setCopyError(result.error.message);
          return;
        }
        // In the same transition as the action's revalidated routes, to the week that got the dishes.
        router.push(`/matsedel${weekQuery(target.weekStart)}`);
        setCopying(false);
        showToast(copiedText(result.data.copied, target.weekStart));
      } finally {
        copyInFlight.current = false;
      }
    });
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
        {planSummaryText({ ...plan, weekStart: plan.weekStart ?? null, dishCount: plan.recipes.length })}
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
              <p className="text-meta text-ink-3">
                {dish.weekday ? `${weekdayNames[dish.weekday - 1]} · ` : ""}
                {formatPortions(dish.servings)}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2">
        {copyNote ? (
          <p id={noteId} data-testid="copy-note" className="text-meta text-ink-2">
            {copyNote}
          </p>
        ) : null}
        <Button
          variant="secondary"
          fullWidth
          disabled={busy || reusable === 0}
          aria-describedby={copyNote || plan.recipes.length === 0 ? noteId : undefined}
          onClick={() => {
            setCopyError(null);
            setCopying(true);
          }}
        >
          Kopiera till {"\u2026"}
        </Button>
        <Button variant="text" disabled={busy} onClick={ask} className="self-start -ml-3">
          Ta bort matsedel
        </Button>
      </div>
      <Sheet
        open={copying}
        onClose={() => setCopying(false)}
        title={"Kopiera till \u2026"}
        subtitle={`${plan.name}: rätterna läggs efter dem som redan finns`}
        closeLabel="Avbryt"
        preventClose={copyBusy}
      >
        <div className="flex flex-col gap-2">
          {copyError ? <Notice role="alert">{copyError}</Notice> : null}
          {copyTargets().map((target) => (
            <Button
              key={target.weekStart}
              variant="secondary"
              fullWidth
              disabled={copyBusy}
              data-testid="copy-target"
              onClick={() => copyTo(target)}
            >
              {target.label} ({target.name.toLocaleLowerCase("sv-SE")})
            </Button>
          ))}
        </div>
      </Sheet>
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
