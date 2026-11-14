import { claudeModels, formatSek, sekPerUsd } from "@/features/settings";

// What a reading of a menu costs, in words, for "Menyns sidor" (the route layer knows the price table; the advisor
// does not import Inställningar, AD-1). An estimate, rounded up rather than down: the cost grows with the pages, since
// every photo is sent to the model and a longer menu is a longer answer. The daily AI cap counts the real tokens.

/** Tokens of the instructions and the answer's schema, sent with every reading (the prompt is about 5 000 characters). */
const baseTokensIn = 2_500;
/** Tokens of one page: a photo of 2048 × 1536 px is about 4 200 tokens (width × height / 750); the most a model takes is 4 784. */
const pageTokensIn = 4_300;
/** Tokens written for one page of dishes (about 40 dishes of 80 tokens), and for each further page. */
const firstPageTokensOut = 3_200;
const morePageTokensOut = 1_500;
/** Sonnet at medium effort thinks before it writes: about this much more is written. */
const carefulThinkingTokens = 2_000;

const haiku = claudeModels.find((model) => model.id === "claude-haiku-5-5")!;
const sonnet = claudeModels.find((model) => model.id === "claude-sonnet-5-5")!;

/** The estimate in kronor of one reading of `pages` photos: `standard` is Haiku 5.5, `careful` Sonnet 5.5 (Läs noggrannare). */
export function menuReadCostSek(pages: number, quality: "standard" | "careful"): number {
  const count = Math.max(1, Math.round(pages));
  const tokensIn = baseTokensIn + count * pageTokensIn;
  const tokensOut = firstPageTokensOut + (count - 1) * morePageTokensOut + (quality === "careful" ? carefulThinkingTokens : 0);
  const model = quality === "careful" ? sonnet : haiku;
  return ((tokensIn * model.usdPerMTokIn + tokensOut * model.usdPerMTokOut) / 1_000_000) * sekPerUsd;
}

/** "Kostar ca 0,05 kr för 3 sidor. Läs noggrannare ca 1,0 kr." */
export function menuReadCostText(pages: number): string {
  const count = Math.max(1, Math.round(pages));
  const what = count === 1 ? "1 sida" : `${count} sidor`;
  return `Kostar ${formatSek(menuReadCostSek(count, "standard"))} för ${what}. Läs noggrannare ${formatSek(menuReadCostSek(count, "careful"))}.`;
}
