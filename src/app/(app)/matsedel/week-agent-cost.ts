import { weekPlanTokens } from "@/features/week-agent/ui";
import { claudeModels, formatSek, sekPerUsd } from "@/features/settings";
import type { CostTexts } from "@/features/week-agent/ui";

// What a week proposal costs, from the app's own price table (settings → ai-choice.ts) and the rough size of one
// proposal; never typed in by hand. "ca 0,01 kr" for Haiku (the first run and "Gör om"), the Sonnet price for "Gör noggrannare".

function costOf(modelId: string, tokens: { tokensIn: number; tokensOut: number }): string {
  const model = claudeModels.find((entry) => entry.id === modelId);
  if (!model) return "några öre";
  return formatSek(((tokens.tokensIn * model.usdPerMTokIn + tokens.tokensOut * model.usdPerMTokOut) / 1_000_000) * sekPerUsd);
}

export function weekAgentCost(): CostTexts {
  return { standard: costOf("claude-haiku-5-5", weekPlanTokens.standard), careful: costOf("claude-sonnet-5-5", weekPlanTokens.careful) };
}
