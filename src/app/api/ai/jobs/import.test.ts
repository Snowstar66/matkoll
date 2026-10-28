import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok, type Result } from "@/lib/errors";

// Recipe import as an AI job (Story 12.6): the two job routes with the user
// check, the queue and the import stubbed. Nothing is queued for what fails
// the check without AI; the context holds the kind and a link's domain only;
// the input stays in the background run.

const requireUserForRoute = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUserForRoute: () => requireUserForRoute() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ name: "session client" }) }));

const clientKey = "6f1c1e4e-6b1a-4a0e-9d1e-3f4f4f0e6a11";
const job = {
  id: "d3f5f0f0-2b7e-4d0c-8f64-0a7b2a1c9e22",
  kind: "import",
  status: "queued",
  context: { source: "url", domain: "koket.se" },
  errorCode: null,
  createdAt: "2026-10-28T12:00:00.000Z",
  seen: false,
  ahead: 0,
  count: null,
};

type EnqueueInput = { kind: string; clientKey: string; context: Record<string, unknown> };
const enqueueAiJob = vi.fn<(db: unknown, input: EnqueueInput) => Promise<Result<unknown>>>();
type Work = (signal: AbortSignal, deadline: number, report: (partial: unknown) => Promise<void>) => Promise<Result<unknown>>;
const runAiJob = vi.fn<(db: unknown, job: unknown, times: { startBy: number }, work: Work) => Promise<void>>();
vi.mock("@/features/ai-jobs/server", () => ({
  enqueueAiJob: (...args: Parameters<typeof enqueueAiJob>) => enqueueAiJob(...args),
  listAiJobs: async () => ok([]),
  runAiJob: (...args: Parameters<typeof runAiJob>) => runAiJob(...args),
}));

vi.mock("@/features/suggestions/server", () => ({ suggestFromPantry: vi.fn(), checkSuggestPantry: vi.fn() }));

type Input = { kind: string; text?: string; url?: string; image?: { data: Uint8Array; mediaType: string } };
const prepareImport = vi.fn<(input: Input) => Promise<Result<unknown>>>();
const importRecipe = vi.fn<(input: Input, options: { signal: AbortSignal }) => Promise<Result<unknown>>>();
vi.mock("@/features/recipes/server", () => ({
  prepareImport: (input: Input) => prepareImport(input),
  importRecipe: (input: Input, options: { signal: AbortSignal }) => importRecipe(input, options),
}));

let afterCallbacks: (() => Promise<void>)[] = [];
vi.mock("next/server", () => ({ after: (callback: () => Promise<void>) => afterCallbacks.push(callback) }));
vi.mock("@/server/env", () => ({ env: { SITE_URL: "http://localhost:3100" } }));

const jobs = await import("./route");
const photo = await import("./photo/route");

const png = new Uint8Array(readFileSync(new URL("../../../../../tests/fixtures/ai/ugnspannkaka.png", import.meta.url)));

function postJson(payload: unknown) {
  return new Request("http://localhost:3100/api/ai/jobs", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "content-type": "application/json" },
  });
}

async function postPhoto(fields: Record<string, string> = { kind: "import", clientKey }) {
  const form = new FormData();
  form.append("image", new Blob([png as BlobPart], { type: "image/png" }), "photo");
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  const encoded = new Response(form);
  return new Request("http://localhost:3100/api/ai/jobs/photo", {
    method: "POST",
    body: new Uint8Array(await encoded.arrayBuffer()),
    headers: { "content-type": encoded.headers.get("content-type") ?? "" },
  });
}

async function runAfter() {
  const callbacks = afterCallbacks;
  afterCallbacks = [];
  for (const callback of callbacks) await callback();
}

beforeEach(() => {
  afterCallbacks = [];
  requireUserForRoute.mockReset().mockResolvedValue({ user: { id: "user", email: "pontus@example.com" } });
  prepareImport.mockReset().mockResolvedValue(ok({ source: "url", domain: "koket.se" }));
  enqueueAiJob.mockReset().mockResolvedValue(ok({ job, created: true, startBy: 1_000_000 }));
  runAiJob.mockReset().mockResolvedValue(undefined);
  importRecipe.mockReset().mockResolvedValue(ok({ draft: { title: "Soppa" }, ingredientNames: {} }));
});

describe("POST /api/ai/jobs, kind import", () => {
  it("queues a link with only its domain as context, answers 202 and runs the import in after()", async () => {
    const response = await jobs.POST(
      postJson({ kind: "import", clientKey, source: "url", url: "https://www.koket.se/linssoppa" }),
    );

    expect(response.status).toBe(202);
    expect(prepareImport).toHaveBeenCalledWith({ kind: "url", url: "https://www.koket.se/linssoppa" });
    expect(enqueueAiJob.mock.calls[0][1]).toMatchObject({
      kind: "import",
      clientKey,
      context: { source: "url", domain: "koket.se" },
    });
    expect(JSON.stringify(enqueueAiJob.mock.calls[0][1])).not.toContain("linssoppa");
    expect(runAiJob).not.toHaveBeenCalled();

    await runAfter();
    const controller = new AbortController();
    const result = await runAiJob.mock.calls[0][3](controller.signal, Date.now() + 1000, async () => {});
    expect(result).toEqual(ok({ draft: { title: "Soppa" }, ingredientNames: {} }));
    expect(importRecipe).toHaveBeenCalledWith(
      { kind: "url", url: "https://www.koket.se/linssoppa" },
      { signal: controller.signal },
    );
  });

  it("queues pasted text", async () => {
    prepareImport.mockResolvedValue(ok({ source: "text" }));
    const response = await jobs.POST(postJson({ kind: "import", clientKey, source: "text", text: "Linssoppa" }));
    expect(response.status).toBe(202);
    expect(enqueueAiJob.mock.calls[0][1].context).toEqual({ source: "text" });
  });

  it.each([
    ["a site that is not approved", fail("fetch_domain_not_allowed", { domain: "ica.se" }), 422],
    ["a link that is not a link", fail("fetch_invalid_url"), 422],
  ])("answers %s at once, without a job", async (_name, failure, status) => {
    prepareImport.mockResolvedValue(failure);
    const response = await jobs.POST(postJson({ kind: "import", clientKey, source: "url", url: "koket" }));
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(failure.error.code);
    expect(enqueueAiJob).not.toHaveBeenCalled();
  });

  it("refuses a text over 12 000 characters without a job", async () => {
    const response = await jobs.POST(postJson({ kind: "import", clientKey, source: "text", text: "a".repeat(13_000) }));
    expect(response.status).toBe(400);
    expect(prepareImport).not.toHaveBeenCalled();
    expect(enqueueAiJob).not.toHaveBeenCalled();
  });

  it("takes a body up to 64 kB, and refuses one over it with 413", async () => {
    const big = JSON.stringify({ kind: "import", clientKey, source: "text", text: "a".repeat(70 * 1024) });
    const response = await jobs.POST(
      new Request("http://localhost:3100/api/ai/jobs", {
        method: "POST",
        body: big,
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(413);
  });

  it("answers ai_queue_full when three jobs are active", async () => {
    enqueueAiJob.mockResolvedValue(fail("ai_queue_full"));
    const response = await jobs.POST(postJson({ kind: "import", clientKey, source: "url", url: "https://koket.se/x" }));
    expect((await response.json()).error.code).toBe("ai_queue_full");
  });

  it("does not run a job that was given back", async () => {
    enqueueAiJob.mockResolvedValue(ok({ job, created: false, startBy: 1_000_000 }));
    await jobs.POST(postJson({ kind: "import", clientKey, source: "url", url: "https://koket.se/x" }));
    await runAfter();
    expect(runAiJob).not.toHaveBeenCalled();
  });

  it("refuses an import without a source", async () => {
    const response = await jobs.POST(postJson({ kind: "import", clientKey, text: "x" }));
    expect(response.status).toBe(400);
    expect(enqueueAiJob).not.toHaveBeenCalled();
  });
});

describe("POST /api/ai/jobs/photo", () => {
  it("allows the longest wait and run", () => {
    expect(photo.maxDuration).toBe(300);
  });

  it("queues a photo with the source only as context and runs the import with its bytes in after()", async () => {
    prepareImport.mockResolvedValue(ok({ source: "photo" }));
    const response = await photo.POST(await postPhoto());

    expect(response.status).toBe(202);
    expect(enqueueAiJob.mock.calls[0][1]).toMatchObject({ kind: "import", clientKey, context: { source: "photo" } });
    await runAfter();
    await runAiJob.mock.calls[0][3](new AbortController().signal, Date.now() + 1000, async () => {});
    const [input] = importRecipe.mock.calls[0];
    expect(input.kind).toBe("photo");
    expect(input.image?.mediaType).toBe("image/png");
    expect(Buffer.from(input.image?.data ?? []).equals(Buffer.from(png))).toBe(true);
  });

  it("refuses a form without the import kind or a client key", async () => {
    expect((await photo.POST(await postPhoto({ clientKey }))).status).toBe(400);
    expect((await photo.POST(await postPhoto({ kind: "import", clientKey: "x" }))).status).toBe(400);
    expect(enqueueAiJob).not.toHaveBeenCalled();
  });

  it("refuses a body that is not a form with 415", async () => {
    const response = await photo.POST(
      new Request("http://localhost:3100/api/ai/jobs/photo", {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(415);
  });
});
