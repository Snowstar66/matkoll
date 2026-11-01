import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { WelcomeTourDataError } from "../data/welcome-tour";

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const saveTourSeenIn = vi.fn();
vi.mock("../data/welcome-tour", async (original) => ({
  ...(await original<typeof import("../data/welcome-tour")>()),
  saveTourSeenIn: (...args: unknown[]) => saveTourSeenIn(...args),
}));

const { markTourSeen } = await import("./mark-tour-seen");

beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  saveTourSeenIn.mockReset().mockResolvedValue(undefined);
});

describe("markTourSeen", () => {
  it("records the tour as seen for the signed-in user", async () => {
    expect(await markTourSeen()).toEqual(ok(null));
    expect(saveTourSeenIn).toHaveBeenCalledWith(db);
  });

  it("refuses without a session", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await markTourSeen()).toEqual(fail("unauthorized"));
    expect(saveTourSeenIn).not.toHaveBeenCalled();
  });

  it("says when it could not be saved, and logs the code only", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    saveTourSeenIn.mockRejectedValue(new WelcomeTourDataError("save_welcome_tour_failed 42501"));
    expect(await markTourSeen()).toEqual(fail("welcome_tour_save_failed"));
    expect(log).toHaveBeenCalledWith("welcome_tour_save_failed", { reason: "save_welcome_tour_failed 42501" });
    log.mockRestore();
  });

  it("lets other errors through", async () => {
    saveTourSeenIn.mockRejectedValue(new Error("bug"));
    await expect(markTourSeen()).rejects.toThrow("bug");
  });
});
