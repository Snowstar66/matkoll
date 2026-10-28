"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { AiJobsDataError, cancelAiJobIn, dismissAiJobIn, markAiJobSeenIn, type AiJobsDb, type Touched } from "../data/jobs";

// The three things Pontus does to a job (Story 12.4, AD-28): "Avbryt", the
// result has been shown, and the result is closed or saved. Server Actions
// that start with requireUser() and validate with Zod (AD-2). Nothing is
// revalidated: no page renders jobs on the server (AD-18). A job that is
// gone (closed on another device, older than 24 hours) is `ai_job_gone`; the
// client takes it as done. Only the Postgres code is logged.

const idSchema = z.uuid();

async function touchJob(
  id: string,
  touch: (db: AiJobsDb, id: string) => Promise<Touched>,
): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return fail("validation");
  try {
    return (await touch(await createClient(), parsed.data)) === "gone" ? fail("ai_job_gone") : ok();
  } catch (error) {
    if (!(error instanceof AiJobsDataError)) throw error;
    console.error("ai_job_error", { reason: error.detail });
    return fail("ai_unavailable");
  }
}

/** "Avbryt": a queued or running job is cancelled, and the function that runs it stops within a few seconds. */
export async function cancelAiJob(id: string): Promise<Result<null>> {
  return touchJob(id, cancelAiJobIn);
}

/** The result of the job has been shown: the tab's badge goes. */
export async function markAiJobSeen(id: string): Promise<Result<null>> {
  return touchJob(id, markAiJobSeenIn);
}

/** The result is closed or saved: the job is removed. */
export async function dismissAiJob(id: string): Promise<Result<null>> {
  return touchJob(id, dismissAiJobIn);
}
