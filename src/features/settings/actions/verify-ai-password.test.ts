import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const env: Record<string, unknown> = {};
vi.mock("@/server/env", () => ({ env }));

const { verifyAiPassword } = await import("./verify-ai-password");

beforeEach(() => {
  for (const key of Object.keys(env)) delete env[key];
  Object.assign(env, { NODE_ENV: "development" });
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
});

describe("verifyAiPassword", () => {
  it("accepts the default password, refuses a wrong or empty one", async () => {
    expect(await verifyAiPassword("frasse")).toEqual(ok(true));
    expect(await verifyAiPassword("fel")).toEqual(fail("validation"));
    expect(await verifyAiPassword("")).toEqual(fail("validation"));
  });

  it("uses AI_SETTINGS_PASSWORD when set", async () => {
    env.AI_SETTINGS_PASSWORD = "hemligt";
    expect(await verifyAiPassword("hemligt")).toEqual(ok(true));
    expect(await verifyAiPassword("frasse")).toEqual(fail("validation"));
  });

  it("refuses anyone the section is not shown to, and answers unauthorized for no user", async () => {
    Object.assign(env, { NODE_ENV: "production", AI_SETTINGS_EMAILS: ["someone@example.com"] });
    expect(await verifyAiPassword("frasse")).toEqual(fail("validation"));
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await verifyAiPassword("frasse")).toEqual(fail("unauthorized"));
  });
});
