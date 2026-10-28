import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok, type Result } from "@/lib/errors";
import { jpegHeader } from "../../../../../../tests/support/image-headers";

// The Route Handler of a photo's AI job (Story 12.5) with the user check, the
// queue, the place check and the two steps of the work stubbed: the request
// checks, what is queued (the place, the location and the time, never the
// photo), the 202 before any work, and the work after the response: the
// reading first as the partial result, the numbers second, and when they are
// skipped.

const requireUserForRoute = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUserForRoute: () => requireUserForRoute() }));

const db = { name: "session client" };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));

const clientKey = "6f1c1e4e-6b1a-4a0e-9d1e-3f4f4f0e6a11";
const siteId = "55555555-5555-4555-8555-555555555555";
const takenAt = "2026-10-28T12:00:00.000Z";
const job = {
  id: "d3f5f0f0-2b7e-4d0c-8f64-0a7b2a1c9e22",
  kind: "analyze",
  status: "queued",
  context: { siteId, location: "Kyl", takenAt },
  errorCode: null,
  createdAt: "2026-10-28T12:00:00.000Z",
  seen: false,
  ahead: 0,
  count: null,
};

type EnqueueInput = { kind: string; clientKey: string; context: Record<string, unknown>; requestStartedAt: number };
const enqueueAiJob = vi.fn<(db: unknown, input: EnqueueInput) => Promise<Result<unknown>>>();
type Work = (signal: AbortSignal, deadline: number, report: (partial: unknown) => Promise<void>) => Promise<Result<unknown>>;
const runAiJob = vi.fn<(db: unknown, job: unknown, times: { startBy: number }, work: Work) => Promise<void>>();
vi.mock("@/features/ai-jobs/server", () => ({
  enqueueAiJob: (...args: Parameters<typeof enqueueAiJob>) => enqueueAiJob(...args),
  runAiJob: (...args: Parameters<typeof runAiJob>) => runAiJob(...args),
  functionMs: 295_000,
}));

type Image = { data: Uint8Array; mediaType: string };
const lookUpSite = vi.fn<(siteId: string | undefined) => Promise<unknown>>();
const readPhoto = vi.fn<(input: { image: Image; location: string; site: unknown }, options: { signal: AbortSignal; deadline?: number }) => Promise<Result<unknown>>>();
const locatePlaceItems = vi.fn<(input: { image: Image; labels: string[] }, options: { signal: AbortSignal; deadline?: number }) => Promise<Result<unknown>>>();
vi.mock("@/features/pantry/server", () => ({
  lookUpSite: (id: string | undefined) => lookUpSite(id),
  readPhoto: (...args: Parameters<typeof readPhoto>) => readPhoto(...args),
  locatePlaceItems: (...args: Parameters<typeof locatePlaceItems>) => locatePlaceItems(...args),
}));

const startImportJob = vi.fn<(source: { kind: string; image: Image }, key: string, startedAt: number) => Promise<Response>>();
vi.mock("../start-import", () => ({ startImportJob: (...args: Parameters<typeof startImportJob>) => startImportJob(...args) }));

/** The callbacks given to after(), run by the test once the response is there. */
let afterCallbacks: (() => Promise<void>)[] = [];
vi.mock("next/server", () => ({ after: (callback: () => Promise<void>) => afterCallbacks.push(callback) }));

vi.mock("@/server/env", () => ({ env: { SITE_URL: "http://localhost:3100" } }));

const { POST, maxDuration } = await import("./route");

const url = "http://localhost:3100/api/ai/jobs/photo";
const png = new Uint8Array(readFileSync(new URL("../../../../../../tests/fixtures/ai/kyl.png", import.meta.url)));
const hemma = { id: siteId, name: "Hemma" };

function form(
  data: Uint8Array | null,
  fields: Partial<Record<"kind" | "clientKey" | "location" | "site" | "takenAt", string | null>> = {},
): FormData {
  const values = { kind: "analyze", clientKey, location: "Kyl", site: siteId, takenAt, ...fields };
  const body = new FormData();
  if (data !== null) body.append("image", new Blob([data as BlobPart], { type: "image/png" }), "photo");
  for (const [name, value] of Object.entries(values)) if (value !== null) body.append(name, value);
  return body;
}

/** The request as a browser sends it, with the multipart body encoded up front. */
async function post(init: { body?: BodyInit; headers?: Record<string, string> } = {}) {
  let body = init.body ?? form(png);
  const headers = new Headers(init.headers);
  if (body instanceof FormData) {
    const encoded = new Response(body);
    if (!headers.has("content-type")) headers.set("content-type", encoded.headers.get("content-type") ?? "");
    body = new Uint8Array(await encoded.arrayBuffer());
  }
  return new Request(url, { method: "POST", body, headers });
}

/** Runs the work the route gave runAiJob, with a fresh signal and `deadline`, and says what it reported and returned. */
async function runWork(deadline = Date.now() + 120_000, signal = new AbortController().signal) {
  await POST(await post());
  for (const callback of afterCallbacks) await callback();
  afterCallbacks = [];
  const work = runAiJob.mock.calls[0][3];
  const reported: unknown[] = [];
  const result = await work(signal, deadline, async (partial) => void reported.push(partial));
  return { reported, result };
}

const reading = {
  site: hemma,
  location: "Kyl",
  suggestions: [{ id: "s1", name: "mjölk", itemNumbers: [1] }],
  dropped: 0,
  seen: [],
  incomplete: false,
  reading: ["Mjölk"],
  points: null,
};
const points = { positions: [{ n: 1, x: 100, y: 200 }] };

beforeEach(() => {
  afterCallbacks = [];
  requireUserForRoute.mockReset().mockResolvedValue({ user: { id: "user", email: "pontus@example.com" } });
  lookUpSite.mockReset().mockResolvedValue({ ok: true, site: hemma });
  enqueueAiJob.mockReset().mockResolvedValue(ok({ job, created: true, startBy: 1_000_000 }));
  runAiJob.mockReset().mockResolvedValue(undefined);
  startImportJob.mockReset().mockResolvedValue(Response.json(ok({ job }), { status: 202 }));
  readPhoto.mockReset().mockResolvedValue(ok(reading));
  locatePlaceItems.mockReset().mockResolvedValue(ok(points));
});

describe("POST /api/ai/jobs/photo", () => {
  it("has room for the longest wait and run (AD-28)", () => {
    expect(maxDuration).toBe(300);
  });

  it("queues the job with only the place, the location and the time as context, answers 202 with the job, and runs nothing before the response", async () => {
    const before = Date.now();
    const response = await POST(await post());
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true, data: { job } });
    expect(lookUpSite).toHaveBeenCalledWith(siteId);
    const [passedDb, input] = enqueueAiJob.mock.calls[0];
    expect(passedDb).toBe(db);
    expect(input).toMatchObject({ kind: "analyze", clientKey, context: { siteId, location: "Kyl", takenAt } });
    expect(Object.keys(input.context).sort()).toEqual(["location", "siteId", "takenAt"]);
    expect(input.requestStartedAt).toBeGreaterThanOrEqual(before);
    expect(afterCallbacks).toHaveLength(1);
    expect(runAiJob).not.toHaveBeenCalled();
    expect(readPhoto).not.toHaveBeenCalled();
  });

  it("gives the job to runAiJob after the response, with the session client and the time to start by", async () => {
    await POST(await post());
    await afterCallbacks[0]();
    expect(runAiJob).toHaveBeenCalledTimes(1);
    const [passedDb, passedJob, times] = runAiJob.mock.calls[0];
    expect(passedDb).toBe(db);
    expect(passedJob).toEqual(job);
    expect(times).toEqual({ startBy: 1_000_000 });
  });

  it("runs nothing for a job that was given back (a double tap, another tab)", async () => {
    enqueueAiJob.mockResolvedValue(ok({ job, created: false, startBy: 1_000_000 }));
    const response = await POST(await post());
    expect(response.status).toBe(202);
    expect(afterCallbacks).toHaveLength(0);
  });

  it("does the reading first and reports it, then looks up the numbers with the same photo, and ends with both", async () => {
    const signal = new AbortController().signal;
    const deadline = Date.now() + 120_000;
    const { reported, result } = await runWork(deadline, signal);

    const [readInput, readOptions] = readPhoto.mock.calls[0];
    expect(readInput.location).toBe("Kyl");
    expect(readInput.site).toEqual(hemma);
    expect(readInput.image.mediaType).toBe("image/png");
    expect(Buffer.from(readInput.image.data).equals(Buffer.from(png))).toBe(true);
    expect(readOptions).toEqual({ signal, deadline });
    // The cards can come at once: the reading is the job's partial result, without points.
    expect(reported).toEqual([reading]);
    const [locateInput, locateOptions] = locatePlaceItems.mock.calls[0];
    expect(locateInput.labels).toEqual(["Mjölk"]);
    expect(Buffer.from(locateInput.image.data).equals(Buffer.from(png))).toBe(true);
    expect(locateOptions.signal).toBe(signal);
    expect(locateOptions.deadline).toBeLessThanOrEqual(Date.now() + 30_000);
    expect(result).toEqual(ok({ ...reading, points }));
  });

  it("ends with the reading and points `failed` when the numbers fail, never with an error", async () => {
    locatePlaceItems.mockResolvedValue(fail("ai_unavailable"));
    const { result } = await runWork();
    expect(result).toEqual(ok({ ...reading, points: "failed" }));
  });

  it("passes on the error of the reading, and reports nothing", async () => {
    readPhoto.mockResolvedValue(fail("ai_unavailable"));
    const { reported, result } = await runWork();
    expect(result).toEqual(fail("ai_unavailable"));
    expect(reported).toEqual([]);
    expect(locatePlaceItems).not.toHaveBeenCalled();
  });

  it.each([
    ["less than 40 s of the function's time is left", () => Date.now() + 120_000, () => vi.setSystemTime(Date.now() + 260_000)],
    ["less than 8 s of the job's own time is left", () => Date.now() + 2_000, () => {}],
  ])("skips the numbers when %s after the reading", async (_name, deadline, jump) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      readPhoto.mockImplementation(async () => {
        jump();
        return ok(reading);
      });
      const { result } = await runWork(deadline());
      expect(locatePlaceItems).not.toHaveBeenCalled();
      expect(result).toEqual(ok({ ...reading, points: "skipped" }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips the numbers when no suggestion has an item to point at, or the job was stopped", async () => {
    readPhoto.mockResolvedValue(ok({ ...reading, suggestions: [{ id: "s1", name: "mjölk" }] }));
    expect((await runWork()).result).toEqual(ok({ ...reading, suggestions: [{ id: "s1", name: "mjölk" }], points: "skipped" }));
    expect(locatePlaceItems).not.toHaveBeenCalled();

    afterCallbacks = [];
    runAiJob.mockClear();
    readPhoto.mockResolvedValue(ok(reading));
    const controller = new AbortController();
    readPhoto.mockImplementation(async () => {
      controller.abort();
      return ok(reading);
    });
    await runWork(Date.now() + 120_000, controller.signal);
    expect(locatePlaceItems).not.toHaveBeenCalled();
  });

  it("hands a photo of a recipe (`kind` import, Story 12.6) to the import job, without the place's checks", async () => {
    const response = await POST(await post({ body: form(png, { kind: "import", location: null, site: null, takenAt: null }) }));
    expect(response.status).toBe(202);
    expect(startImportJob).toHaveBeenCalledTimes(1);
    const [source, key] = startImportJob.mock.calls[0];
    expect(source.kind).toBe("photo");
    expect(key).toBe(clientKey);
    expect(lookUpSite).not.toHaveBeenCalled();
    expect(enqueueAiJob).not.toHaveBeenCalled();
  });

  it("holds a recipe photo to the smaller size, and validates its key", async () => {
    expect((await POST(await post({ body: form(jpegHeader(2000, 1500), { kind: "import" }) }))).status).toBe(413);
    expect((await POST(await post({ body: form(png, { kind: "import", clientKey: "abc" }) }))).status).toBe(400);
    expect(startImportJob).not.toHaveBeenCalled();
  });

  it("answers a place that is gone or cannot be read at once, before anything is queued", async () => {
    lookUpSite.mockResolvedValue({ ok: false, result: fail("pantry_site_gone") });
    const gone = await POST(await post());
    expect(gone.status).toBe(409);
    expect(await gone.json()).toEqual(fail("pantry_site_gone"));
    expect(enqueueAiJob).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(0);
  });

  it("answers the queue's error without running anything", async () => {
    enqueueAiJob.mockResolvedValue(fail("ai_queue_full"));
    const response = await POST(await post());
    expect(await response.json()).toEqual(fail("ai_queue_full"));
    expect(afterCallbacks).toHaveLength(0);
  });

  it("uses the selected place without `site` (a client of before Story 8.4)", async () => {
    await POST(await post({ body: form(png, { site: null }) }));
    expect(lookUpSite).toHaveBeenCalledWith(undefined);
  });

  it.each([
    ["no key", { clientKey: null }],
    ["a key that is not a uuid", { clientKey: "abc" }],
    ["another kind", { kind: "suggest" }],
    ["no kind", { kind: null }],
    ["an unknown location", { location: "Källare" }],
    ["no location", { location: null }],
    ["a site that is not a uuid", { site: "hemma" }],
    ["no time", { takenAt: null }],
    ["a time that is not a time", { takenAt: "igår" }],
  ])("answers validation with 400 for %s, without queuing anything", async (_name, fields) => {
    const response = await POST(await post({ body: form(png, fields) }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(fail("validation"));
    expect(enqueueAiJob).not.toHaveBeenCalled();
  });

  it("answers the checks of the photo before anything else: no photo, a type, a size", async () => {
    expect((await POST(await post({ body: form(null) }))).status).toBe(400);
    expect((await POST(await post({ body: form(new Uint8Array([1, 2, 3])) }))).status).toBe(415);
    expect((await POST(await post({ body: form(jpegHeader(4000, 3000)) }))).status).toBe(413);
    expect(enqueueAiJob).not.toHaveBeenCalled();
  });

  it("answers 415 for a body that is not a form, and 403 across sites, without a session check for the second", async () => {
    const json = await POST(
      new Request(url, { method: "POST", body: "{}", headers: { "content-type": "application/json" } }),
    );
    expect(json.status).toBe(415);
    const cross = await POST(await post({ headers: { origin: "https://evil.example" } }));
    expect(cross.status).toBe(403);
    expect(requireUserForRoute).toHaveBeenCalledTimes(1);
  });

  it("answers the 401 from requireUserForRoute without queuing anything", async () => {
    requireUserForRoute.mockResolvedValue({ response: Response.json(fail("unauthorized"), { status: 401 }) });
    expect((await POST(await post())).status).toBe(401);
    expect(lookUpSite).not.toHaveBeenCalled();
    expect(enqueueAiJob).not.toHaveBeenCalled();
  });
});
