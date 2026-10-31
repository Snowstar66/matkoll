import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "@/lib/errors";
import { startCardReading } from "./start-reading";

// startCardReading with stand-ins for the session, the database and the queue:
// a throw after the card is saved (a RangeError seen in the field) must not
// leave a card that is `reading` for ever, nobody to read it.

const mocks = vi.hoisted(() => {
  const deleted: string[] = [];
  return {
    deleted,
    removeCardFiles: vi.fn(async () => ({ failed: null })),
    enqueueAiJob: vi.fn(),
    db: {
      from: () => ({
        delete: () => ({
          eq: async (_column: string, id: string) => {
            deleted.push(id);
            return { error: null };
          },
        }),
      }),
    },
  };
});

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/features/auth/server", () => ({ requireUser: async () => ({ ok: true, data: { id: "user-1" } }) }));
vi.mock("@/features/settings/server", () => ({ getAiServiceForUser: vi.fn() }));
vi.mock("@/features/ai-jobs/server", () => ({ enqueueAiJob: mocks.enqueueAiJob, runAiJob: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => mocks.db }));
vi.mock("@/lib/revalidate", () => ({ revalidateFor: vi.fn() }));
vi.mock("../data/photos", () => ({
  uploadCardFile: vi.fn(async () => undefined),
  insertCardIn: vi.fn(async () => "saved"),
  loadCardIn: vi.fn(),
  markCardFailedIn: vi.fn(),
  reopenCardIn: vi.fn(),
  saveReadingIn: vi.fn(),
  downloadCardFile: vi.fn(),
  removeCardFiles: mocks.removeCardFiles,
}));
vi.mock("./merge-card", () => ({ mergeCardWithRoom: vi.fn() }));
vi.mock("./sweep-card-files", () => ({ sweepCardFilesIn: vi.fn() }));

/** The smallest JPEG the cleaner accepts: SOI, a frame, a scan with one byte of data, EOI. */
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

describe("startCardReading", () => {
  beforeEach(() => {
    mocks.deleted.length = 0;
    mocks.removeCardFiles.mockClear();
    mocks.enqueueAiJob.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("removes the card, row and file, when queueing it throws, and lets the error through for the route to log", async () => {
    mocks.enqueueAiJob.mockRejectedValue(new RangeError("Invalid time value"));
    await expect(startCardReading(input)).rejects.toThrow(RangeError);
    expect(mocks.removeCardFiles).toHaveBeenCalledTimes(1);
    expect(mocks.deleted).toHaveLength(1);
  });

  it("keeps the card when its job is queued", async () => {
    mocks.enqueueAiJob.mockResolvedValue(ok({ job: { id: "job-1" }, created: false, startBy: 0 }));
    const result = await startCardReading(input);
    expect(result.ok).toBe(true);
    expect(mocks.deleted).toHaveLength(0);
  });
});
