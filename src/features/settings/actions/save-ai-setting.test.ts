import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { SettingsDataError } from "../data/client";

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const saveAiSettingIn = vi.fn();
const clearAiSettingIn = vi.fn();
vi.mock("../data/ai-setting", () => ({
  saveAiSettingIn: (...args: unknown[]) => saveAiSettingIn(...args),
  clearAiSettingIn: (...args: unknown[]) => clearAiSettingIn(...args),
}));
const env: Record<string, unknown> = {};
vi.mock("@/server/env", () => ({ env }));

const { saveAiSetting } = await import("./save-ai-setting");

const sonnet = { provider: "anthropic", model: "claude-sonnet-5-5", effort: "high" } as const;

beforeEach(() => {
  for (const key of Object.keys(env)) delete env[key];
  Object.assign(env, { NODE_ENV: "development", ANTHROPIC_API_KEY: "sk-ant-test", LMSTUDIO_BASE_URL: "http://localhost:1234/v1", AI_PROVIDER: "lmstudio", AI_MODEL: "qwen/test" });
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  saveAiSettingIn.mockReset().mockResolvedValue(undefined);
  clearAiSettingIn.mockReset().mockResolvedValue(undefined);
  revalidateFor.mockReset();
});

describe("saveAiSetting", () => {
  it("saves a Claude choice and revalidates Inställningar", async () => {
    expect(await saveAiSetting(sonnet)).toEqual(ok(sonnet));
    expect(saveAiSettingIn).toHaveBeenCalledWith(db, "user", { provider: "anthropic", model: "claude-sonnet-5-5", effort: "high" });
    expect(revalidateFor).toHaveBeenCalledWith("ai_setting");
  });

  it("saves Qwen with the model from the environment, and clears for default", async () => {
    await saveAiSetting({ provider: "lmstudio" });
    expect(saveAiSettingIn).toHaveBeenCalledWith(db, "user", { provider: "lmstudio", model: "qwen/test", effort: "medium" });
    await saveAiSetting({ provider: "default" });
    expect(clearAiSettingIn).toHaveBeenCalledWith(db, "user");
  });

  it("refuses Claude without a key, and Qwen without a URL, without writing", async () => {
    delete env.ANTHROPIC_API_KEY;
    expect(await saveAiSetting(sonnet)).toEqual(fail("validation"));
    delete env.LMSTUDIO_BASE_URL;
    expect(await saveAiSetting({ provider: "lmstudio" })).toEqual(fail("validation"));
    expect(saveAiSettingIn).not.toHaveBeenCalled();
  });

  it("refuses a model that is not listed", async () => {
    expect(await saveAiSetting({ ...sonnet, model: "claude-nope" } as never)).toEqual(fail("validation"));
  });

  it("refuses anyone the section is not shown to, outside development", async () => {
    Object.assign(env, { NODE_ENV: "production", AI_SETTINGS_EMAILS: ["someone@example.com"] });
    expect(await saveAiSetting(sonnet)).toEqual(fail("validation"));
    env.AI_SETTINGS_EMAILS = ["pontus@example.com"];
    expect((await saveAiSetting(sonnet)).ok).toBe(true);
  });

  it("answers unauthorized for no user, and settings_save_failed when Supabase fails", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await saveAiSetting(sonnet)).toEqual(fail("unauthorized"));
    requireUser.mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
    saveAiSettingIn.mockRejectedValue(new SettingsDataError("save_ai_setting_failed 500"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await saveAiSetting(sonnet)).toEqual(fail("settings_save_failed"));
  });
});
