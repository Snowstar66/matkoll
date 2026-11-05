"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/button";
import { SparkleIcon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { useRecipeFilter } from "@/features/recipes/ui/recipe-filter-store";
import { isActive } from "@/lib/ai-job-shape";
import { useAiJobs } from "@/lib/ai-jobs-client";

/** What the toast says when the job has started. */
export const findDishesStartedText = "Letar efter rätter med det du har hemma. Du kan göra annat under tiden.";

/**
 * "Vad kan jag laga?" at the top of Hemma: starts the same AI job as "Föreslå
 * rätter med AI" in Recept (kind `suggest`; the server reads the selected
 * place's pantry itself) and opens Recept on Kan lagas nu, where the result
 * shows. When a suggestion job is already on its way nothing new is started:
 * Pontus is only taken there.
 */
export function FindDishesButton() {
  const router = useRouter();
  const { showToast } = useToast();
  const { jobs, start } = useAiJobs();
  const [, setFilter] = useRecipeFilter();
  const [starting, setStarting] = useState(false);
  const key = useRef<string | null>(null);

  async function find() {
    if (starting) return;
    const open = () => {
      setFilter("cookable");
      router.push("/recept");
    };
    if (jobs.some((job) => job.kind === "suggest" && isActive(job))) {
      open();
      return;
    }
    setStarting(true);
    // The same key again gives the same job, so a retry after a lost answer never makes a second one.
    const clientKey = (key.current ??= crypto.randomUUID());
    const result = await start("/api/ai/jobs", { kind: "suggest", avoidTitles: [] }, clientKey);
    setStarting(false);
    if (!result.ok) {
      if (result.error.code !== "ai_unavailable") key.current = null;
      showToast(result.error.message, { role: "alert" });
      return;
    }
    key.current = null;
    showToast(findDishesStartedText);
    open();
  }

  return (
    <Button variant="secondary" fullWidth data-testid="find-dishes" disabled={starting} onClick={() => void find()}>
      <SparkleIcon size={22} />
      Vad kan jag laga?
    </Button>
  );
}
