import { describe, expect, it } from "vitest";
import { parseEnv } from "@/server/env-schema";
import { aiChoiceFor, aiSettingsViewFor, defaultChoiceFor } from "./ai-env";

const qwen = { AI_PROVIDER: "lmstudio", LMSTUDIO_BASE_URL: "http://localhost:1234/v1", AI_MODEL: "qwen/test" };
const withKey = parseEnv({ ...qwen, ANTHROPIC_API_KEY: "sk-ant-test" });
const withoutKey = parseEnv(qwen);
const haikuMedium = { provider: "anthropic", model: "claude-haiku-5-5", effort: "medium" };

describe("the default when nothing is saved", () => {
  it("is Haiku 5.5 at Medel when ANTHROPIC_API_KEY is set", () => {
    expect(aiChoiceFor(withKey, null)).toEqual(haikuMedium);
    expect(defaultChoiceFor(withKey)).toEqual(haikuMedium);
    const view = aiSettingsViewFor(withKey, null);
    expect(view).toMatchObject({ effective: haikuMedium, isDefault: true, claudeAvailable: true });
  });

  it("falls back to the environment's provider and model when the key is missing", () => {
    expect(aiChoiceFor(withoutKey, null)).toBeNull();
    const view = aiSettingsViewFor(withoutKey, null);
    expect(view).toMatchObject({ effective: null, isDefault: true, claudeAvailable: false, qwenModel: "qwen/test" });
    expect(view.defaultText).toBe("Qwen lokalt (qwen/test)");
  });

  it("never replaces the mock provider, key or not", () => {
    expect(aiChoiceFor(parseEnv({ AI_PROVIDER: "mock", ANTHROPIC_API_KEY: "sk-ant-test" }), null)).toBeNull();
  });

  it("never replaces the mock provider with a saved choice either", () => {
    const sonnet = { provider: "anthropic", model: "claude-sonnet-5-5", effort: "high" } as const;
    expect(aiChoiceFor(parseEnv({ AI_PROVIDER: "mock", ANTHROPIC_API_KEY: "sk-ant-test" }), sonnet)).toBeNull();
  });
});

describe("a saved choice", () => {
  it("is used as saved, with Qwen's model from the environment", () => {
    const sonnet = { provider: "anthropic", model: "claude-sonnet-5-5", effort: "high" } as const;
    expect(aiChoiceFor(withKey, sonnet)).toEqual(sonnet);
    expect(aiSettingsViewFor(withKey, sonnet)).toMatchObject({ effective: sonnet, isDefault: false });
    expect(aiChoiceFor(withKey, { provider: "lmstudio", model: "old", effort: "low" })).toEqual({
      provider: "lmstudio",
      model: "qwen/test",
      effort: "low",
    });
  });

  it("gives way to the default when its key or URL is missing now, or its model is not listed", () => {
    const sonnet = { provider: "anthropic", model: "claude-sonnet-5-5", effort: "high" } as const;
    expect(aiChoiceFor(withoutKey, sonnet)).toBeNull();
    expect(aiSettingsViewFor(withoutKey, sonnet).isDefault).toBe(true);
    expect(aiChoiceFor(withKey, { ...sonnet, model: "claude-unknown" })).toEqual(haikuMedium);
    const noUrl = parseEnv({ AI_PROVIDER: "mock" });
    expect(aiChoiceFor(noUrl, { provider: "lmstudio", model: "x", effort: "low" })).toBeNull();
  });
});
