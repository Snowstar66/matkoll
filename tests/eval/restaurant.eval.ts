// `pnpm eval:restaurant`: Restaurangagentens webbsökning på ett par svenska orter, genom appens egen väg
// (findWithAi: riktig prompt, riktigt sökverktyg hos Anthropic, appens guard). Kostar riktiga pengar (ANTHROPIC_API_KEY
// ur .env.local, laddas av pnpm-skriptet; filen skriver aldrig ut den): ungefär 0,2 till 1,5 kr per fall. Aldrig en del av
// `pnpm test`, CI eller andra eval-skript.
//
//   pnpm eval:restaurant                        fyra orter, en körning var
//   EVAL_PLACES="Luleå,Visby" pnpm eval:restaurant   egna orter
//
// Läs utskriften själv: stämmer namnen, finns sidorna, är adress/öppettider/betyg rätt citerade, hur ofta hittas de?
// Skriver en tabell till konsolen. Inget sparas.
import { describe, it } from "vitest";
import { claudeModels } from "@/features/settings/domain/ai-choice";
import { findWithAi } from "@/features/restaurant-agent/ai-find";
import { buildLlmInput } from "@/features/restaurant-agent/domain/llm-input";
import { defaultRestaurantSettings } from "@/features/restaurant-agent/domain/types";
import { createAiService } from "@/server/ai/service";
import { parseEnv } from "@/server/env-schema";

const places = (process.env.EVAL_PLACES ?? "Uppsala,Göteborg,Visby,Luleå").split(",").map((place) => place.trim()).filter(Boolean);
const price = (id: string) => {
  const model = claudeModels.find((entry) => entry.id === id);
  if (!model) throw new Error(`no price for ${id}`);
  return { usdPerMTokIn: model.usdPerMTokIn, usdPerMTokOut: model.usdPerMTokOut };
};

describe("Restaurangagenten, webbsökning", () => {
  it("söker på riktiga orter", async () => {
    const env = parseEnv({ ...process.env, AI_PROVIDER: "anthropic", AI_MODEL: "claude-haiku-5-5" });
    const ai = createAiService(env);
    const rows: string[] = [];
    for (const place of places) {
      const input = buildLlmInput({ ...defaultRestaurantSettings, party: 3, cuisines: ["pizza"], priorities: ["kids"] }, { people: [{ allergies: ["nötter"], likes: ["pasta"], avoids: [] }] }, place);
      const started = Date.now();
      const result = await findWithAi(ai, input, { standard: price("claude-haiku-5-5"), careful: price("claude-sonnet-5-5") }, { spentSek: 0, dayRemainingSek: 10 }, new AbortController().signal);
      const seconds = Math.round((Date.now() - started) / 1000);
      if (result.status !== "ok") {
        rows.push(`${place}: ${result.status}${"code" in result ? ` (${result.code})` : ""}, ${seconds} s, ${result.spentSek.toFixed(2)} kr`);
        continue;
      }
      const picks = result.picks;
      const count = (pick: (p: (typeof picks)[number]) => unknown) => picks.filter((p) => pick(p)).length;
      rows.push(`${place}: ${picks.length} ställen (${result.model}, ${result.rejected} avvisade), meny ${count((p) => p.menu)}, adress ${count((p) => p.address)}, öppettider ${count((p) => p.hours)}, betyg ${count((p) => p.rating)}, ${seconds} s, ${result.spentSek.toFixed(2)} kr`);
      for (const pick of picks) rows.push(`   - ${pick.name} | ${pick.why.map((reason) => `${reason.text} <${reason.sourceUrl}>`).join(" / ")}`);
    }
    console.info(`\n${rows.join("\n")}\n`);
  });
});
