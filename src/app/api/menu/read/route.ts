import { requireUserForRoute } from "@/features/auth/server";
import { formatMenuStreamLine, menuReaderOf, menuStreamContentType, normalizeMenu, type MenuReading, type MenuStreamEvent } from "@/features/menu-advisor";
import { getAiServiceForUser } from "@/features/settings/server";
import { fail, ok, type Result } from "@/lib/errors";
import { maxMenuBodyBytes, maxMenuPages, maxPlacePhotoSide } from "@/lib/images";
import type { MenuProgress, ReadMenuInput } from "@/server/ai";
import { isCrossSite, mediaTypeOf, readImagesForm, respond } from "../../ai/route-support";

// Menyrådgivare: photos of a restaurant menu, read by the AI port's readMenu (AD-9). multipart/form-data with one to
// maxMenuPages resized photos, each in a field `image`, in page order (the pages of one menu, read together in ONE
// AI call that gives one list of dishes), and optionally the text field `quality` ("standard" or "careful"). The
// whole body is at most maxMenuBodyBytes (4 MiB, under Vercel's 4.5 MB); every photo is checked as one is elsewhere
// (type by its bytes, at most 1.5 MB and 2048 px). A page the model could not read at all is named in the menu's
// `olasbara_sidor` (1 = the first photo); the other pages are read all the same. The answer is the menu after normalizeMenu (the
// currency symbol on the menu wins over the model's currency): `{ menu, quality, escalated, model, effort }` (model
// and effort say who read it: "Haiku 5.5" · "låg"). The call goes through getAiServiceForUser, so the household's
// daily cap is asked first (`ai_cap_reached`) and the usage is counted. The photo is only held in memory: never
// stored, never logged.
//
// With `?stream=1` the same reading is a live one: the answer is NDJSON (application/x-ndjson), one MenuStreamEvent
// per line (domain/reading.ts): `reading`, `language`, a `dish` for each dish as soon as the model has written it,
// and last `done` with the whole menu. A failure before anything has been sent is the same JSON answer and status
// as without `stream` (429 for the cap, ...); one after it is an `error` line. Same checks, cap and usage.

// A reading of a large menu can take a standard and a careful run after each other.
export const maxDuration = 180;

/** The time the model gets; within maxDuration. */
const readDeadlineMs = 165_000;

export async function POST(request: Request): Promise<Response> {
  if (isCrossSite(request)) return respond(fail("unauthorized"), 403);
  const auth = await requireUserForRoute();
  if (auth.response) return auth.response;

  if (mediaTypeOf(request) !== "multipart/form-data") return respond(fail("validation"), 415);
  // Small print needs more pixels than a list: the same side as a photo of a place.
  const form = await readImagesForm(request, ["quality"], { maxSide: maxPlacePhotoSide, maxBodyBytes: maxMenuBodyBytes, maxImages: maxMenuPages });
  if (!form.ok) return form.response;
  const { quality } = form.fields;
  if (quality !== null && quality !== "standard" && quality !== "careful") return respond(fail("validation"), 400);
  const input: ReadMenuInput = { images: form.images, quality: quality === "careful" ? "careful" : quality === "standard" ? "standard" : undefined };

  if (new URL(request.url).searchParams.get("stream") === "1") return streamReading(request, input);

  let result: Result<MenuReading>;
  try {
    const ai = await getAiServiceForUser();
    const read = await ai.readMenu(input, request.signal, { deadline: Date.now() + readDeadlineMs });
    result = read.ok ? ok(readingOf(read.data)) : read;
  } catch (error) {
    console.error("menu_read_failed", { reason: error instanceof Error ? error.name : "unknown" });
    result = fail("ai_unavailable");
  }
  return respond(result);
}

type ReadData = { menu: Parameters<typeof normalizeMenu>[0]; quality: "standard" | "careful"; escalated: boolean };

function readingOf(data: ReadData): MenuReading {
  return { menu: normalizeMenu(data.menu), quality: data.quality, escalated: data.escalated, ...menuReaderOf(data.quality) };
}

/** The live reading: the response starts with the first line, or is the plain failure when the reading fails before it. */
async function streamReading(request: Request, input: ReadMenuInput): Promise<Response> {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  let started = false;
  let onStarted: () => void = () => {};
  const startedSignal = new Promise<void>((resolve) => {
    onStarted = resolve;
  });
  const send = (event: MenuStreamEvent) => {
    if (!started) {
      started = true;
      onStarted();
    }
    // The client going away rejects the write; the read is stopped by request.signal.
    void writer.write(encoder.encode(formatMenuStreamLine(event))).catch(() => {});
  };

  let sent = 0;
  const onMenu = (progress: MenuProgress) => {
    if (progress.stage === "reading") {
      send({ type: "reading", quality: progress.quality, restart: progress.escalated, ...menuReaderOf(progress.quality) });
      sent = 0;
    } else if (progress.stage === "language") {
      send({ type: "language", sprak: progress.sprak });
    } else {
      // The currency comes from the symbol on the menu, as in the final answer.
      const { ratter } = normalizeMenu({ restaurang: null, sprak: progress.sprak ?? "annat", valutasymbol_pa_menyn: progress.symbol, ratter: progress.dishes, osakert: [] });
      for (; sent < ratter.length; sent++) send({ type: "dish", index: sent, dish: ratter[sent]! });
    }
  };

  const work = (async (): Promise<Result<MenuReading>> => {
    try {
      const ai = await getAiServiceForUser();
      const read = await ai.readMenu(input, request.signal, { deadline: Date.now() + readDeadlineMs, onMenu });
      return read.ok ? ok(readingOf(read.data)) : read;
    } catch (error) {
      console.error("menu_read_failed", { reason: error instanceof Error ? error.name : "unknown" });
      return fail("ai_unavailable");
    }
  })();
  void work.then((result) => {
    if (result.ok) send({ type: "done", ...result.data });
    else if (started) send({ type: "error", code: result.error.code });
    void writer.close().catch(() => {});
  });

  await Promise.race([startedSignal, work]);
  if (!started) {
    const result = await work;
    if (!result.ok) return respond(result);
  }
  return new Response(readable, { headers: { "content-type": menuStreamContentType, "cache-control": "no-store", "x-accel-buffering": "no" } });
}
