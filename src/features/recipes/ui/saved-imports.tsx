"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { useToast } from "@/components/toast";
import { useAiJobs } from "@/lib/ai-jobs-client";
import type { AiJob } from "@/lib/ai-job-shape";
import { fail, isErrorCode } from "@/lib/errors";
import { deleteRecipe } from "../actions/delete-recipe";
import { saveRecipe } from "../actions/save-recipe";
import { importErrorMessage, recipeImportSchema, type ImportKind } from "../domain/import";

// Story 1.15: an import lands in the library by itself. The job saves the recipe when it
// finishes (src/app/api/ai/jobs/start-import.ts, with the job's id as the recipe's id). This
// component, mounted once in the signed-in layout, sees every finished import that has not been
// handled, also one that finished while the app was closed: it saves the recipe if the job could
// not (the same id, so never a copy), closes the job and says "Receptet X är sparat" with "Öppna"
// and "Ångra". A failed import stays as a card on Recept (ImportFailures) until it is closed.

/** The import kind of a job, from its context. */
export function kindOfJob(job: AiJob): ImportKind {
  const source = job.context.source;
  return source === "url" || source === "photo" ? source : "text";
}

export function SavedImports() {
  const { jobs, loaded, fetchResult, dismiss } = useAiJobs();
  const { showToast } = useToast();
  const router = useRouter();
  /** The jobs taken here, so none is taken twice (a poll, Strict Mode, a second render). */
  const taken = useRef(new Set<string>());

  async function undo(recipeId: string) {
    let removed = false;
    try {
      removed = (await deleteRecipe(recipeId)).ok;
    } catch {
      removed = false;
    }
    showToast(removed ? "Receptet är borttaget." : "Det gick inte att ångra.", { role: removed ? "status" : "alert" });
    if (removed) router.refresh();
  }

  async function take(id: string) {
    let answer = await fetchResult(id);
    // A read that failed (a busy server, a lost connection) is tried again a few times; polling has
    // stopped by now, so nothing else would bring the job back before the next time the app opens.
    for (let attempt = 0; !answer.ok && answer.error.code !== "ai_job_gone" && attempt < 3; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      answer = await fetchResult(id);
    }
    if (!answer.ok) {
      // Older than 24 hours or closed elsewhere: nothing left to save.
      if (answer.error.code === "ai_job_gone") await dismiss(id);
      else taken.current.delete(id);
      return;
    }
    const parsed = recipeImportSchema.safeParse((answer.data as { result: unknown }).result);
    if (!parsed.success) {
      await dismiss(id);
      showToast(fail("ai_invalid").error.message, { role: "alert" });
      return;
    }
    const { draft, savedRecipeId } = parsed.data;
    let recipeId = savedRecipeId;
    if (!recipeId) {
      // The job could not save it (or it finished before Story 1.15): save it now, under the job's id.
      try {
        const saved = await saveRecipe(draft, id);
        recipeId = saved.ok ? saved.data.id : undefined;
      } catch {
        recipeId = undefined;
      }
      if (!recipeId) {
        // The job stays, and the next time the app opens it is tried again.
        showToast("Det gick inte att spara receptet. Försök igen om en stund.", { role: "alert" });
        return;
      }
    }
    await dismiss(id);
    const savedId = recipeId;
    router.refresh();
    showToast(`Receptet ${draft.title} är sparat`, {
      waitForUndo: true,
      show: { label: "Öppna", onShow: () => router.push(`/recept/${savedId}`) },
      onUndo: () => void undo(savedId),
    });
  }

  useEffect(() => {
    if (!loaded) return;
    for (const job of jobs) {
      if (job.kind !== "import" || job.status !== "done" || job.seen || taken.current.has(job.id)) continue;
      taken.current.add(job.id);
      void take(job.id);
    }
    // take uses what is current when it runs; the list of jobs decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, loaded]);

  return null;
}

/** On Recept: an import that did not go stays as a card with the reason, until it is closed. Nothing was saved. */
export function ImportFailures() {
  const { jobs, dismiss } = useAiJobs();
  const failed = jobs.filter((job) => job.kind === "import" && job.status === "failed" && !job.seen);
  if (failed.length === 0) return null;
  return (
    <div className="flex flex-col gap-3 pb-3">
      {failed.map((job) => {
        const code = job.errorCode !== null && isErrorCode(job.errorCode) ? job.errorCode : "ai_unavailable";
        const domain = job.context.domain;
        const shown = fail(
          code,
          typeof domain === "string" && code !== "fetch_domain_not_allowed" ? { domain } : undefined,
        ).error;
        return (
          <Notice
            key={job.id}
            role="alert"
            action={
              <Button variant="text" onClick={() => void dismiss(job.id)}>
                Stäng
              </Button>
            }
          >
            {importErrorMessage(shown, kindOfJob(job))}
          </Notice>
        );
      })}
    </div>
  );
}
