import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { retryCardReading, startCardReading } from "./start-reading";

// Värt en titt: the reading asks the AI to flag föremål worth a closer look only when the request says so
// (the switch is on the device, so the photo or the retry carries it). Without it, listThings gets no flag.

const mocks = vi.hoisted(() => ({
  listThings: vi.fn(),
  works: [] as ((signal: AbortSignal, deadline: number) => Promise<unknown>)[],
  enqueueAiJob: vi.fn(),
  db: { from: () => ({ delete: () => ({ eq: async () => ({ error: null }) }), update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }) },
}));

vi.mock("next/server", () => ({ after: (callback: () => unknown) => void callback() }));
vi.mock("@/features/auth/server", () => ({ requireUser: async () => ({ ok: true, data: { id: "user-1" } }) }));
vi.mock("@/features/settings/server", () => ({ getAiServiceForUser: async () => ({ listThings: mocks.listThings }) }));
vi.mock("@/features/ai-jobs/server", () => ({
  enqueueAiJob: mocks.enqueueAiJob,
  runAiJob: async (_db: unknown, _job: unknown, _options: unknown, work: (typeof mocks.works)[number]) => void mocks.works.push(work),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => mocks.db }));
vi.mock("@/lib/revalidate", () => ({ revalidateFor: vi.fn() }));
vi.mock("../data/photos", () => ({
  uploadCardFile: vi.fn(async () => undefined),
  cardFileRoomIn: vi.fn(async () => true),
  insertCardIn: vi.fn(async () => "saved"),
  loadCardIn: vi.fn(async () => ({ id: "card-1", placeId: "place-1", takenAt: new Date(), status: "failed", createdAt: new Date(0), objectPath: "p", mediaType: "image/jpeg" })),
  markCardFailedIn: vi.fn(),
  reopenCardIn: vi.fn(async () => true),
  saveReadingIn: vi.fn(),
  downloadCardFile: vi.fn(async () => new Blob([new Uint8Array([1])])),
  removeCardFiles: vi.fn(async () => ({ failed: null })),
}));
vi.mock("./merge-card", () => ({ mergeCardWithRoom: vi.fn() }));
vi.mock("./sweep-card-files", () => ({ sweepCardFilesIn: vi.fn(async () => 0) }));

const jpeg = new Uint8Array([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x10, 0x00, 0x10, 0x01, 0x01, 0x11, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0xff, 0xd9,
]);
const input = {
  image: { data: jpeg, mediaType: "image/jpeg" as const },
  placeId: "place-1",
  takenAt: new Date("2026-10-31T10:00:00Z"),
  clientKey: "client-1",
  requestStartedAt: Date.now(),
};

/** Runs the job's work the way runAiJob would, with the model failing so the card ends there. */
async function runWork() {
  const work = mocks.works.at(-1);
  if (!work) throw new Error("no job was run");
  await work(new AbortController().signal, Date.now() + 60_000);
}

beforeEach(() => {
  mocks.works.length = 0;
  mocks.listThings.mockReset().mockResolvedValue(fail("ai_unavailable"));
  mocks.enqueueAiJob.mockReset().mockResolvedValue(ok({ job: { id: "job-1" }, created: true, startBy: 0 }));
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Värt en titt in the reading", () => {
  it("asks for it when the photo says so", async () => {
    expect((await startCardReading({ ...input, worth: true })).ok).toBe(true);
    await runWork();
    expect(mocks.listThings).toHaveBeenCalledWith(expect.objectContaining({ worth: true }), expect.anything(), expect.anything());
  });

  it("asks for nothing without it: no flag at all", async () => {
    expect((await startCardReading(input)).ok).toBe(true);
    await runWork();
    const [listed] = mocks.listThings.mock.calls[0];
    expect(listed).not.toHaveProperty("worth");
  });

  it("carries it through a retry too, and leaves it out otherwise", async () => {
    expect((await retryCardReading({ cardId: "card-1", clientKey: "k", requestStartedAt: Date.now(), worth: true })).ok).toBe(true);
    await runWork();
    expect(mocks.listThings.mock.calls[0][0]).toHaveProperty("worth", true);
    mocks.listThings.mockClear();
    expect((await retryCardReading({ cardId: "card-1", clientKey: "k2", requestStartedAt: Date.now() })).ok).toBe(true);
    await runWork();
    expect(mocks.listThings.mock.calls[0][0]).not.toHaveProperty("worth");
  });
});
