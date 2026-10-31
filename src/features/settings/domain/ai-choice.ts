import { z } from "zod";

// The choice of AI in Inställningar (Story 17.5): provider, model and level,
// for every task at once. Client-safe: no env and no keys here; the server
// tells the screen only whether a key is present.

export const aiProviderChoices = ["default", "lmstudio", "anthropic"] as const;
/** `default` is no saved choice: AI_PROVIDER and AI_MODEL from the environment decide. */
export type AiProviderChoice = (typeof aiProviderChoices)[number];

export const aiLevels = ["low", "medium", "high"] as const;
export type AiLevel = (typeof aiLevels)[number];

export const aiLevelLabels: Record<AiLevel, string> = { low: "Låg", medium: "Medel", high: "Hög" };

export const aiProviderLabels: Record<AiProviderChoice, string> = {
  default: "Standard",
  lmstudio: "Qwen lokalt",
  anthropic: "Claude",
};

/** USD per million tokens, from Anthropic's price list (2026-10). */
export type ClaudeModel = { id: string; label: string; usdPerMTokIn: number; usdPerMTokOut: number };

export const claudeModels = [
  { id: "claude-haiku-5-5", label: "Haiku 5.5", usdPerMTokIn: 0.1, usdPerMTokOut: 0.5 },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5", usdPerMTokIn: 2, usdPerMTokOut: 10 },
  { id: "claude-opus-5-5", label: "Opus 5.5", usdPerMTokIn: 4, usdPerMTokOut: 20 },
] as const satisfies readonly ClaudeModel[];

export type ClaudeModelId = (typeof claudeModels)[number]["id"];
export const claudeModelIds = claudeModels.map((model) => model.id) as [ClaudeModelId, ...ClaudeModelId[]];

/** The model and level used when nothing is saved and ANTHROPIC_API_KEY is set (Pontus, 2026-10-31). */
export const defaultClaudeModel: ClaudeModelId = "claude-haiku-5-5";
export const defaultClaudeLevel: AiLevel = "medium";

/** Kronor per US dollar, for the estimate only. */
export const sekPerUsd = 10;

/** Typical tokens of one call (in, out), as measured on real imports, photos and suggestions. */
export const typicalTokens = {
  import: { label: "import", tokensIn: 10_000, tokensOut: 3_000 },
  photo: { label: "foto", tokensIn: 4_000, tokensOut: 2_000 },
  suggestion: { label: "förslag", tokensIn: 6_000, tokensOut: 3_000 },
} as const;
export type AiTask = keyof typeof typicalTokens;

/** What one call of `task` costs with `model`, in kronor. */
export function estimateCostSek(model: ClaudeModel, task: AiTask): number {
  const { tokensIn, tokensOut } = typicalTokens[task];
  const usd = (tokensIn * model.usdPerMTokIn + tokensOut * model.usdPerMTokOut) / 1_000_000;
  return usd * sekPerUsd;
}

/** "ca 0,03 kr": two decimals under one krona, one decimal from there on. */
export function formatSek(sek: number): string {
  const text = sek < 1 ? sek.toFixed(2) : sek.toFixed(1).replace(/\.0$/, "");
  return `ca ${text.replace(".", ",")} kr`;
}

/** "ca 0,03 kr per import". */
export function costPerCallText(model: ClaudeModel, task: AiTask): string {
  return `${formatSek(estimateCostSek(model, task))} per ${typicalTokens[task].label}`;
}

/** The three estimates of one model, for the list under the model choice. */
export function costSummaryText(model: ClaudeModel): string {
  return (["import", "photo", "suggestion"] as const).map((task) => costPerCallText(model, task)).join(" · ");
}

export const claudeKeyMissingText = "Lägg in ANTHROPIC_API_KEY i .env.local och starta om";
export const qwenUnavailableText = "Lägg in LMSTUDIO_BASE_URL i .env.local och starta om";
export const levelOffForQwenText = "Nivån gäller bara Claude. För Qwen är den avstängd.";

/** What Inställningar sends when the choice is saved. Qwen's model always comes from the environment. */
export const aiSettingSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("default") }),
  z.object({ provider: z.literal("lmstudio") }),
  z.object({ provider: z.literal("anthropic"), model: z.enum(claudeModelIds), effort: z.enum(aiLevels) }),
]);
export type AiSettingInput = z.infer<typeof aiSettingSchema>;

/** The choice of provider, model and level, as saved and as passed to the AI port. */
export type AiSetting = { provider: "lmstudio" | "anthropic"; model: string; effort: AiLevel };

/** What the section AI needs to draw itself; never a key. */
export type AiSettingsView = {
  /**
   * The choice in force: the saved one, or the default (Haiku 5.5, Medel) when
   * none is saved and the key is set; `null` when the environment's Qwen
   * decides (no key).
   */
  effective: AiSetting | null;
  /** True when nothing is saved, so `effective` is the default. */
  isDefault: boolean;
  /** Whether ANTHROPIC_API_KEY is set. */
  claudeAvailable: boolean;
  /** Whether LMSTUDIO_BASE_URL is set. */
  qwenAvailable: boolean;
  /** The model Qwen runs: AI_MODEL, or the app's tested one. */
  qwenModel: string;
  /** What Standard means right now, e.g. "Qwen lokalt (qwen/qwen3.6-35b-a3b)". */
  defaultText: string;
};

/**
 * The section AI is shown in development, and otherwise only to the
 * addresses in AI_SETTINGS_EMAILS (everyone else uses the default).
 */
export function aiSettingsVisible(input: {
  nodeEnv: string | undefined;
  email: string | null | undefined;
  allowed: readonly string[] | undefined;
}): boolean {
  if (input.nodeEnv === "development") return true;
  if (typeof input.email !== "string") return false;
  return (input.allowed ?? []).includes(input.email.trim().toLowerCase());
}
