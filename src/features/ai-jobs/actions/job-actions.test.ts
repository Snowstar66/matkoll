import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { AiJobsDataError } from "../data/jobs";

// cancelAiJob, markAiJobSeen and dismissAiJob: the user is checked first, the
// id is validated, and a job that is gone or a database that fails are
// answers, never thrown to the client (Story 12.4, AD-2, AD-13).

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));

const db = { name: "session client" };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));

const cancelAiJobIn = vi.fn();
const markAiJobSeenIn = vi.fn();
const dismissAiJobIn = vi.fn();
vi.mock("../data/jobs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../data/jobs")>()),
  cancelAiJobIn: (...args: unknown[]) => cancelAiJobIn(...args),
  markAiJobSeenIn: (...args: unknown[]) => markAiJobSeenIn(...args),
  dismissAiJobIn: (...args: unknown[]) => dismissAiJobIn(...args),
}));

const { cancelAiJob, dismissAiJob, markAiJobSeen } = await import("./job-actions");

const id = "d3f5f0f0-2b7e-4d0c-8f64-0a7b2a1c9e22";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  for (const call of [cancelAiJobIn, markAiJobSeenIn, dismissAiJobIn]) call.mockReset().mockResolvedValue("ok");
});

describe.each([
  ["cancelAiJob", cancelAiJob, cancelAiJobIn],
  ["markAiJobSeen", markAiJobSeen, markAiJobSeenIn],
  ["dismissAiJob", dismissAiJob, dismissAiJobIn],
] as const)("%s", (_name, action, data) => {
  it("does it for the signed-in user with the session client", async () => {
    expect(await action(id)).toEqual(ok());
    expect(data).toHaveBeenCalledWith(db, id);
  });

  it("gives unauthorized without touching anything", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await action(id)).toEqual(fail("unauthorized"));
    expect(data).not.toHaveBeenCalled();
  });

  it.each(["", "abc", "d3f5f0f0-2b7e-4d0c-8f64", "1; drop table ai_job"])("gives validation for the id %j", async (bad) => {
    expect(await action(bad)).toEqual(fail("validation"));
    expect(data).not.toHaveBeenCalled();
  });

  it("gives ai_job_gone for a job that is gone or not the user's", async () => {
    data.mockResolvedValue("gone");
    expect(await action(id)).toEqual(fail("ai_job_gone"));
  });

  it("gives ai_unavailable for a database that fails, logging a fixed reason only", async () => {
    data.mockRejectedValue(new AiJobsDataError("cancel_ai_job 57014"));
    expect(await action(id)).toEqual(fail("ai_unavailable"));
    expect(console.error).toHaveBeenCalledWith("ai_job_error", { reason: "cancel_ai_job 57014" });
  });

  it("throws other errors, which are bugs", async () => {
    data.mockRejectedValue(new TypeError("bug"));
    await expect(action(id)).rejects.toThrow("bug");
  });
});
