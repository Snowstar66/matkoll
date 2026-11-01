import { beforeEach, describe, expect, it, vi } from "vitest";
import { WelcomeTourDataError } from "./welcome-tour";

const getCurrentUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ getCurrentUser: () => getCurrentUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const loadTourSeenIn = vi.fn();
vi.mock("./welcome-tour", async (original) => ({
  ...(await original<typeof import("./welcome-tour")>()),
  loadTourSeenIn: (...args: unknown[]) => loadTourSeenIn(...args),
}));

const { hasSeenWelcomeTour } = await import("./queries");

beforeEach(() => {
  getCurrentUser.mockReset().mockResolvedValue({ id: "user", email: "pontus@example.com" });
  loadTourSeenIn.mockReset();
});

describe("hasSeenWelcomeTour", () => {
  it("answers from the user's row", async () => {
    loadTourSeenIn.mockResolvedValue(false);
    expect(await hasSeenWelcomeTour()).toBe(false);
    loadTourSeenIn.mockResolvedValue(true);
    expect(await hasSeenWelcomeTour()).toBe(true);
    expect(loadTourSeenIn).toHaveBeenCalledWith(db);
  });

  it("leaves the tour out without a session", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await hasSeenWelcomeTour()).toBe(true);
    expect(loadTourSeenIn).not.toHaveBeenCalled();
  });

  it("leaves the tour out when the row cannot be read, and logs the code only", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    loadTourSeenIn.mockRejectedValue(new WelcomeTourDataError("load_welcome_tour_failed 42P01"));
    expect(await hasSeenWelcomeTour()).toBe(true);
    expect(log).toHaveBeenCalledWith("welcome_tour_unavailable", { reason: "load_welcome_tour_failed 42P01" });
    log.mockRestore();
  });
});
