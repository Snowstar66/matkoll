import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const env: Record<string, unknown> = {};
vi.mock("@/server/env", () => ({ env }));

const { verifyAiPassword } = await import("./verify-ai-password");

/** The test's AI_SETTINGS_PASSWORD, set through the (mocked) environment: there is no built-in one. */
const password = "test-ai-losenord";

beforeEach(() => {
  for (const key of Object.keys(env)) delete env[key];
  Object.assign(env, { NODE_ENV: "development", AI_SETTINGS_PASSWORD: password });
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
});

describe("verifyAiPassword", () => {
  it("accepts AI_SETTINGS_PASSWORD, refuses a wrong or empty one", async () => {
    expect(await verifyAiPassword(password)).toEqual(ok(true));
    expect(await verifyAiPassword("fel")).toEqual(fail("validation"));
    expect(await verifyAiPassword("")).toEqual(fail("validation"));
  });

  it("uses AI_SETTINGS_PASSWORD as set", async () => {
    env.AI_SETTINGS_PASSWORD = "hemligt";
    expect(await verifyAiPassword("hemligt")).toEqual(ok(true));
    expect(await verifyAiPassword(password)).toEqual(fail("validation"));
  });

  it("refuses every password when AI_SETTINGS_PASSWORD is not set: the old built-in one no longer works", async () => {
    delete env.AI_SETTINGS_PASSWORD;
    for (const given of ["frasse", password, "", "undefined"]) {
      expect(await verifyAiPassword(given), given).toEqual(fail("validation"));
    }
  });

  it("refuses anyone the section is not shown to, and answers unauthorized for no user", async () => {
    Object.assign(env, { NODE_ENV: "production", AI_SETTINGS_EMAILS: ["someone@example.com"] });
    expect(await verifyAiPassword(password)).toEqual(fail("validation"));
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await verifyAiPassword(password)).toEqual(fail("unauthorized"));
  });
});
