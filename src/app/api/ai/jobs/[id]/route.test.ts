import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok, type Result } from "@/lib/errors";

// GET /api/ai/jobs/[id] (Story 12.4, 12.5) with the user check, the job read
// and the pantry stubbed: the result as it is kept for a suggestion job, and
// for a photo's job the reading compared with the place when it is fetched, so
// the stored reading is never changed and a result that is not a reading is
// never shown.

const requireUserForRoute = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUserForRoute: () => requireUserForRoute() }));

const db = { name: "session client" };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));

const getAiJob = vi.fn<(db: unknown, id: string) => Promise<Result<unknown>>>();
vi.mock("@/features/ai-jobs/server", () => ({ getAiJob: (...args: Parameters<typeof getAiJob>) => getAiJob(...args) }));

const compareStoredReading = vi.fn<(stored: unknown) => Promise<unknown>>();
vi.mock("@/features/pantry/server", async () => {
  // The shape the route checks: a reading has its place, location, suggestions and how it was made.
  const { z } = await import("zod");
  const storedReadingSchema = z.object({
    site: z.unknown(),
    location: z.string(),
    suggestions: z.array(z.unknown()),
    dropped: z.number(),
    seen: z.array(z.string()),
    incomplete: z.boolean(),
    points: z.unknown(),
  });
  return { storedReadingSchema, compareStoredReading: (stored: unknown) => compareStoredReading(stored) };
});

vi.mock("@/server/env", () => ({ env: { SITE_URL: "http://localhost:3100" } }));

const { GET } = await import("./route");

const id = "d3f5f0f0-2b7e-4d0c-8f64-0a7b2a1c9e22";
const job = (kind: string, status = "done") => ({
  id,
  kind,
  status,
  context: {},
  errorCode: null,
  createdAt: "2026-10-28T12:00:00.000Z",
  seen: false,
  ahead: 0,
  count: 1,
});
const site = { id: "55555555-5555-4555-8555-555555555555", name: "Hemma" };
const stored = { site, location: "Kyl", suggestions: [], dropped: 0, seen: [], incomplete: false, points: null };

const call = (value = id) => GET(new Request(`http://localhost:3100/api/ai/jobs/${value}`), { params: Promise.resolve({ id: value }) } as never);

beforeEach(() => {
  requireUserForRoute.mockReset().mockResolvedValue({ user: { id: "user", email: "pontus@example.com" } });
  getAiJob.mockReset();
  compareStoredReading.mockReset();
});

describe("GET /api/ai/jobs/[id]", () => {
  it("gives the result of a job that is not a photo's as it is kept, never cached", async () => {
    getAiJob.mockResolvedValue(ok({ job: job("suggest"), result: { suggestions: [] } }));
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual(ok({ job: job("suggest"), result: { suggestions: [] } }));
    expect(compareStoredReading).not.toHaveBeenCalled();
  });

  it("compares the reading of a photo's job with the place as it is now, and gives that, with the job's points", async () => {
    const compared = { ...stored, inventory: { kind: "compared", missing: [], incomplete: false } };
    getAiJob.mockResolvedValue(ok({ job: job("analyze", "running"), result: stored }));
    compareStoredReading.mockResolvedValue(compared);
    const response = await call();
    expect(await response.json()).toEqual(ok({ job: job("analyze", "running"), result: compared }));
    expect(compareStoredReading).toHaveBeenCalledWith(stored);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("compares again for every fetch, so a result that waited is true when it is opened", async () => {
    getAiJob.mockResolvedValue(ok({ job: job("analyze"), result: stored }));
    compareStoredReading.mockResolvedValueOnce({ n: 1 }).mockResolvedValueOnce({ n: 2 });
    expect((await (await call()).json()).data.result).toEqual({ n: 1 });
    expect((await (await call()).json()).data.result).toEqual({ n: 2 });
  });

  it("gives ai_invalid, never the result, when a photo's job holds something that is not a reading", async () => {
    getAiJob.mockResolvedValue(ok({ job: job("analyze"), result: { suggestions: "nej" } }));
    const response = await call();
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual(fail("ai_invalid"));
    expect(compareStoredReading).not.toHaveBeenCalled();
  });

  it("passes on what getAiJob answers when there is no result: gone, or a database that cannot be reached", async () => {
    getAiJob.mockResolvedValue(fail("ai_job_gone"));
    const gone = await call();
    expect(gone.status).toBe(404);
    expect(await gone.json()).toEqual(fail("ai_job_gone"));
    expect(compareStoredReading).not.toHaveBeenCalled();
  });

  it("gives ai_job_gone for an id that is not a uuid, without reading anything", async () => {
    expect((await call("inte-ett-id")).status).toBe(404);
    expect(getAiJob).not.toHaveBeenCalled();
  });

  it("answers the 401 from requireUserForRoute without reading anything", async () => {
    requireUserForRoute.mockResolvedValue({ response: Response.json(fail("unauthorized"), { status: 401 }) });
    expect((await call()).status).toBe(401);
    expect(getAiJob).not.toHaveBeenCalled();
  });
});
