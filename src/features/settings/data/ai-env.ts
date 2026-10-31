import { defaultLmStudioModel, type Env } from "@/server/env-schema";
import { claudeModels, defaultClaudeLevel, defaultClaudeModel, type AiSetting, type AiSettingsView } from "../domain/ai-choice";

// What the environment makes of the AI choice (Story 17.5). Pure: takes the
// parsed env, so it can be tested without process.env.

type AiEnv = Pick<Env, "AI_PROVIDER" | "AI_MODEL" | "ANTHROPIC_API_KEY" | "LMSTUDIO_BASE_URL">;

/** The model Qwen runs: AI_MODEL when the default is LM Studio, else the model the app is tested with. */
export function qwenModelFor(env: Pick<Env, "AI_PROVIDER" | "AI_MODEL">): string {
  return env.AI_PROVIDER === "lmstudio" && env.AI_MODEL ? env.AI_MODEL : defaultLmStudioModel;
}

/** What "Standard" means: the provider and model of AI_PROVIDER/AI_MODEL. */
export function defaultText(env: Pick<Env, "AI_PROVIDER" | "AI_MODEL">): string {
  switch (env.AI_PROVIDER) {
    case "lmstudio":
      return `Qwen lokalt (${qwenModelFor(env)})`;
    case "anthropic":
      return `Claude (${env.AI_MODEL})`;
    case "openai":
      return `OpenAI (${env.AI_MODEL})`;
    case "mock":
      return "Låtsas-AI för test";
  }
}

/**
 * What runs when nothing is saved: Claude Haiku 5.5 at Medel when
 * ANTHROPIC_API_KEY is set, otherwise (`null`) AI_PROVIDER/AI_MODEL. Never
 * for the mock provider, which tests rely on.
 */
export function defaultChoiceFor(env: AiEnv): AiSetting | null {
  if (!env.ANTHROPIC_API_KEY || env.AI_PROVIDER === "mock") return null;
  return { provider: "anthropic", model: defaultClaudeModel, effort: defaultClaudeLevel };
}

export function aiSettingsViewFor(env: AiEnv, saved: AiSetting | null): AiSettingsView {
  const claudeAvailable = env.ANTHROPIC_API_KEY !== undefined;
  const qwenAvailable = env.LMSTUDIO_BASE_URL !== undefined;
  // A saved choice whose provider is not available now shows as Standard, as the jobs use it.
  const usable =
    saved && (saved.provider === "anthropic" ? claudeAvailable : qwenAvailable) ? saved : null;
  return {
    effective: usable ?? defaultChoiceFor(env),
    isDefault: usable === null,
    claudeAvailable, qwenAvailable,
    qwenModel: qwenModelFor(env),
    defaultText: defaultText(env),
  };
}

/**
 * The choice an AI job runs with, or `null` for AI_PROVIDER/AI_MODEL. With
 * no saved choice, or one whose key or URL is missing now, it is the default
 * (defaultChoiceFor). Qwen's model is always the environment's, so a changed
 * AI_MODEL applies.
 */
export function aiChoiceFor(env: AiEnv, saved: AiSetting | null): AiSetting | null {
  // Tests run with the mock: a saved row must never reach a real, paid provider.
  if (env.AI_PROVIDER === "mock") return null;
  if (saved?.provider === "lmstudio" && env.LMSTUDIO_BASE_URL) {
    return { provider: "lmstudio", model: qwenModelFor(env), effort: saved.effort };
  }
  // A model id this app does not list (a row from elsewhere) is not sent to Claude.
  if (saved?.provider === "anthropic" && env.ANTHROPIC_API_KEY && claudeModels.some((model) => model.id === saved.model)) {
    return saved;
  }
  return defaultChoiceFor(env);
}
