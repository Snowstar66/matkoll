"use server";

import { readBuildInfo } from "@/app/build-info";
import { requireUser } from "@/features/auth/server";
import { createClient } from "@/lib/supabase/server";
import { insertErrorReportIn } from "../data/feedback";
import { buildErrorReport, reportVersion, type ErrorReportInput, errorReportSchema } from "../domain/error-report";

/**
 * Reports an error from the browser (an error boundary, an unhandled error or
 * rejection) into the owner's inbox, as the signed-in user. The text is checked,
 * scrubbed and cut here, whatever the browser sent. Never throws and never fails
 * visibly: reporting an error must not become an error (nothing happens when
 * nobody is signed in, when the report is for something expected, or when the user
 * has sent 5 in 10 minutes, which the database keeps).
 */
export async function reportError(input: ErrorReportInput): Promise<void> {
  try {
    const user = await requireUser();
    if (!user.ok) return;
    const parsed = errorReportSchema.safeParse(input);
    if (!parsed.success) return;
    // The server cannot see navigator.onLine; the browser has already skipped offline errors.
    const report = buildErrorReport(parsed.data);
    if (!report) return;
    await insertErrorReportIn(await createClient(), report, reportVersion(readBuildInfo()));
  } catch {
    // Swallowed on purpose.
  }
}
