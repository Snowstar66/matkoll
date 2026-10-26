"use client";

import Link from "next/link";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Notice } from "@/components/notice";
import { newPlan } from "../actions/new-plan";
import { planSummaryText, type PlanSummary } from "../domain/meal-plan";
import { useCreatePlan } from "./use-create-plan";

// Tidigare matsedlar (FR-14): the earlier meal plans newest first, each with
// its name, number of dishes and the date it was made, so two "Vecka 44" from
// different years can be told apart. A tap opens the plan. "Ny matsedel"
// makes a new, empty current plan; the current one becomes an earlier plan.

export type PreviousPlansProps = {
  /** The earlier plans, newest first (mealplan.listPreviousPlans). */
  plans: readonly PlanSummary[];
};

export function PreviousPlans({ plans }: PreviousPlansProps) {
  const { creating, error, run } = useCreatePlan((id) => newPlan(id));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {error ? <Notice role="alert">{error}</Notice> : null}
        <Button variant="secondary" disabled={creating} onClick={run} className="self-start">
          {creating ? "Skapar …" : "Ny matsedel"}
        </Button>
      </div>
      {plans.length === 0 ? (
        <EmptyState>Inga tidigare matsedlar än.</EmptyState>
      ) : (
        <ul aria-label="Tidigare matsedlar" className="flex flex-col gap-3">
          {plans.map((plan) => (
            <li
              key={plan.id}
              data-testid="previous-plan"
              className="relative flex flex-col gap-1 rounded-lg bg-surface p-3"
            >
              <Link
                href={`/matsedel/tidigare/${plan.id}`}
                className="line-clamp-2 text-row-title break-words text-ink outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent"
              >
                {plan.name}
              </Link>
              <p className="text-meta text-ink-3">{planSummaryText(plan)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
