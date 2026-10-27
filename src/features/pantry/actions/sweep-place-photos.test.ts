import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";

// sweepPlacePhotos (Story 10.3) with the user check, the session client, the
// sweep and revalidation stubbed: Hemma is revalidated only when something
// went, and a failure is logged with its reason only.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const sweepPlacePhotosIn = vi.fn();
vi.mock("./photo-sweep", () => ({ sweepPlacePhotosIn: (...args: unknown[]) => sweepPlacePhotosIn(...args) }));

const { sweepPlacePhotos } = await import("./sweep-place-photos");

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  sweepPlacePhotosIn.mockReset().mockResolvedValue({ removed: 2, failed: null });
  revalidateFor.mockReset();
  log?.mockRestore();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("sweepPlacePhotos", () => {
  it("sweeps with the session client and revalidates Hemma when something went", async () => {
    expect(await sweepPlacePhotos()).toEqual(ok({ removed: 2 }));
    expect(sweepPlacePhotosIn).toHaveBeenCalledWith(db);
    expect(revalidateFor).toHaveBeenCalledWith("pantry_photo");
    expect(log).not.toHaveBeenCalled();
  });

  it("revalidates nothing when nothing went", async () => {
    sweepPlacePhotosIn.mockResolvedValue({ removed: 0, failed: null });
    expect(await sweepPlacePhotos()).toEqual(ok({ removed: 0 }));
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("logs the reason and fails, keeping what went revalidated", async () => {
    sweepPlacePhotosIn.mockResolvedValue({ removed: 1, failed: "remove_failed 503" });
    expect(await sweepPlacePhotos()).toEqual(fail("pantry_photo_remove_failed"));
    expect(log).toHaveBeenCalledWith("pantry_photo_remove_failed", { reason: "remove_failed 503" });
    expect(revalidateFor).toHaveBeenCalledWith("pantry_photo");
  });

  it("gives unauthorized without a user, and sweeps nothing", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await sweepPlacePhotos()).toEqual(fail("unauthorized"));
    expect(sweepPlacePhotosIn).not.toHaveBeenCalled();
  });
});
