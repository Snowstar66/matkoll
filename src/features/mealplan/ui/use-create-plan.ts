"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useToast } from "@/components/toast";
import { fail, type Result } from "@/lib/errors";
import { planCreatedText } from "../domain/meal-plan";

/**
 * "Använd igen" and "Ny matsedel": runs the action with a new plan id, made
 * once per attempt. On success Pontus lands on Matsedel with "Matsedeln är
 * skapad.". A failure that may pass (`mealplan_create_failed`, or no answer)
 * keeps the id, so a retry after a lost answer makes the plan once, and
 * `error` says "Försök igen". A failure a retry cannot fix drops the id: a
 * plan deleted elsewhere (`mealplan_plan_gone`) sends Pontus to Tidigare with
 * the reason, and plans changed elsewhere (`mealplan_plans_changed`) read the
 * page again and say so. A tap while an attempt runs does nothing.
 */
export function useCreatePlan(create: (newPlanId: string) => Promise<Result<{ id: string }>>) {
  const router = useRouter();
  const { showToast } = useToast();
  const [creating, startCreating] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pendingId = useRef<string | null>(null);
  /** Set from the tap until the answer, before React has rendered `creating`. */
  const inFlight = useRef(false);

  function run() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    pendingId.current ??= crypto.randomUUID();
    const id = pendingId.current;
    startCreating(async () => {
      try {
        let result: Result<{ id: string }>;
        try {
          result = await create(id);
        } catch {
          // No answer (e.g. no connection): the plan may or may not exist; a retry uses the same id.
          result = fail("mealplan_create_failed");
        }
        if (result.ok) {
          pendingId.current = null;
          // In the same transition as the action's revalidated routes.
          router.push("/matsedel");
          showToast(planCreatedText);
          return;
        }
        switch (result.error.code) {
          case "unauthorized":
            router.refresh();
            return;
          case "mealplan_plan_gone":
            pendingId.current = null;
            router.replace("/matsedel/tidigare");
            showToast(result.error.message, { role: "alert" });
            return;
          case "mealplan_plans_changed":
            pendingId.current = null;
            router.refresh();
            setError(result.error.message);
            return;
          default:
            setError(result.error.message);
        }
      } finally {
        inFlight.current = false;
      }
    });
  }

  return { creating, error, run };
}
