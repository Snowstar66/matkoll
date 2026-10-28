import { z } from "zod";
import { requireUserForRoute } from "@/features/auth/server";
import { fail } from "@/lib/errors";
import { isCrossSite, mediaTypeOf, readImageForm, respond } from "../../route-support";
import { startImportJob } from "../start-import";

// Starts a job that reads a photo (Story 12.6, AD-9, AD-15, AD-28): the
// client posts the photo, made small, as multipart/form-data with the fields
// `image`, `kind` ("import") and `clientKey`, and gets the job back at once
// (202). The photo is only held in this request's memory while the job waits
// and runs; it is never written to the database, to disk or to a log.
//
// A multipart form can be posted cross-site without a preflight, so the
// origin checks carry more weight here than for JSON; the session cookies are
// SameSite=Lax as well, so a form on another site has no session.

// The function lives as long as the longest job can wait and run (AD-28).
export const maxDuration = 300;

const fieldsSchema = z.object({ kind: z.literal("import"), clientKey: z.uuid() });

export async function POST(request: Request): Promise<Response> {
  const requestStartedAt = Date.now();
  if (isCrossSite(request)) return respond(fail("unauthorized"), 403);

  const auth = await requireUserForRoute();
  if (auth.response) return auth.response;

  if (mediaTypeOf(request) !== "multipart/form-data") return respond(fail("validation"), 415);
  // Size, type and pixels of the photo, checked on its own bytes (AD-15).
  const form = await readImageForm(request, ["kind", "clientKey"] as const);
  if (!form.ok) return form.response;
  const fields = fieldsSchema.safeParse(form.fields);
  if (!fields.success) return respond(fail("validation"));

  return startImportJob({ kind: "photo", image: form.image }, fields.data.clientKey, requestStartedAt);
}
