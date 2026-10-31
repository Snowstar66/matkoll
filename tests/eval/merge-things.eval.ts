import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildMergeRequest } from "@/features/things/actions/merge-input";
import { createAiService, type MergeThingsInput } from "@/server/ai/service";
import { parseEnv } from "@/server/env-schema";

// `pnpm eval:ai`: mergeThings (Story 18.6) against the configured AI_PROVIDER,
// never in CI.
//
// 1. Hand-written cases: the same cordless circular saw on two cards is one
//    thing; "Hammare" and "Hammare med orange skaft" on different walls, or
//    white shoes and white Salomon sneakers on different shelves, are not.
// 2. The nine photos of one storage room (tests/eval/fixtures/
//    skrapforrad-photo-lists.json: the lists Haiku 5.5 read from them in the
//    spike, where a naive merge removed 12 of 258 things). The cards are
//    taken in file order, as if photographed one after the other; each new
//    card is compared with the kept things of the cards before it, as the
//    job does, and the merges are counted and listed in tests/eval/merge-report.md
//    for a human to judge. No assertion on the count: it is a measurement.
//
// Refuses to run against the mock, which only matches equal names. Set
// EVAL_FIXTURE_MODEL to read the lists another model gave (default
// claude-haiku-5-5).

type PhotoList = { saker: { namn: string; kategori: string; var: string | null; säkerhet: string }[]; ej_synligt?: unknown };

const env = parseEnv(process.env);
if (env.AI_PROVIDER === "mock") {
  throw new Error("pnpm eval:ai needs a real model: set AI_PROVIDER to lmstudio, anthropic or openai (the mock only matches equal names).");
}
const service = createAiService(env);
const reportPath = join(process.cwd(), "tests", "eval", "merge-report.md");
const fixtureModel = process.env.EVAL_FIXTURE_MODEL || "claude-haiku-5-5";
const photos = JSON.parse(readFileSync(join(process.cwd(), "tests", "eval", "fixtures", "skrapforrad-photo-lists.json"), "utf8")) as Record<string, Record<string, PhotoList>>;

const thing = (name: string, where: string | null, card?: string) => ({ name, category: "Verktyg", where, ...(card ? { card } : {}) });

/** The pairs the model made for `input`, as "new name = existing name". */
async function pairsOf(input: MergeThingsInput): Promise<string[]> {
  const result = await service.mergeThings(input, AbortSignal.timeout(120_000));
  if (!result.ok) throw new Error(`mergeThings failed: ${result.error.code}`);
  return result.data.pairs.map((pair) => `${input.added[pair.added].name} = ${input.existing[pair.existing].name}`);
}

describe(`mergeThings mot ${env.AI_PROVIDER}`, () => {
  it("merges the same cordless circular saw seen on two cards", async () => {
    const pairs = await pairsOf({
      room: "Skräpförrådet",
      existing: [thing("Batteridriven cirkelsåg Makita", "på väggen, höger", "Vänstra väggen"), thing("Spade", "golvet, vänster", "Vänstra väggen")] as MergeThingsInput["existing"],
      addedCard: "Hela rummet",
      added: [thing("Cirkelsåg (Makita)", "på väggen, vänster"), thing("Hink", "golvet, höger")],
    });
    expect(pairs).toEqual(["Cirkelsåg (Makita) = Batteridriven cirkelsåg Makita"]);
  });

  it("keeps a hammer and a hammer with an orange handle on different walls apart", async () => {
    const pairs = await pairsOf({
      room: "Skräpförrådet",
      existing: [thing("Hammare", "på väggen, vänster", "Vänstra väggen")] as MergeThingsInput["existing"],
      addedCard: "Högra väggen",
      added: [thing("Hammare med orange skaft", "på väggen, höger")],
    });
    expect(pairs).toEqual([]);
  });

  it("keeps white shoes and white Salomon sneakers on different shelves apart", async () => {
    const pairs = await pairsOf({
      room: "Hallen",
      existing: [{ name: "Vita skor", category: "Kläder & textil", where: "nedre hyllan, vänster", card: "Skohyllan" }],
      addedCard: "Hatthyllan",
      added: [{ name: "Vita sneakers Salomon", category: "Sport & fritid", where: "översta hyllan, höger" }],
    });
    expect(pairs).toEqual([]);
  });

  it("does not make two identical things of one card the same as one kept thing", async () => {
    const pairs = await pairsOf({
      room: "Skräpförrådet",
      existing: [thing("Skruvdragare", "hyllan, mitten", "Hyllan")] as MergeThingsInput["existing"],
      addedCard: "Bänken",
      added: [thing("Skruvdragare", "bänken, vänster"), thing("Skruvdragare", "bänken, höger")],
    });
    expect(pairs.length).toBeLessThanOrEqual(1);
  });

  it(`measures the nine photos of the storage room (${fixtureModel})`, async () => {
    const cards = Object.entries(photos).flatMap(([file, models]) => (models[fixtureModel] ? [{ file, list: models[fixtureModel] }] : []));
    expect(cards.length).toBeGreaterThan(1);
    const kept: { id: string; name: string; category: string; where: string | null; card: string }[] = [];
    const merges: { card: string; added: string; existing: string; existingCard: string }[] = [];
    let total = 0;
    for (const { file, list } of cards) {
      const card = file.replace(/\.[a-z]+$/i, "");
      const added = list.saker.map((item, index) => ({ id: `${card}:${index}`, name: item.namn, category: item.kategori, where: item.var }));
      total += added.length;
      const request = buildMergeRequest("Skräpförrådet", card, added, kept);
      const merged = new Set<string>();
      if (request) {
        const result = await service.mergeThings(request.input, AbortSignal.timeout(120_000));
        if (!result.ok) throw new Error(`mergeThings failed on ${card}: ${result.error.code}`);
        for (const pair of result.data.pairs) {
          const existing = kept.find((candidate) => candidate.id === request.existingIds[pair.existing])!;
          merged.add(request.addedIds[pair.added]);
          merges.push({ card, added: request.input.added[pair.added].name, existing: existing.name, existingCard: existing.card });
        }
      }
      for (const item of added) if (!merged.has(item.id)) kept.push({ ...item, card });
    }
    writeFileSync(reportPath, renderReport(cards.length, total, merges));
    console.log(`${merges.length} merges of ${total} things on ${cards.length} cards, see ${reportPath}`);
    expect(merges.length).toBeLessThan(total);
  });
});

afterAll(() => {
  console.log(`Provider: ${env.AI_PROVIDER}, model: ${env.AI_MODEL ?? "-"}`);
});

function renderReport(cardCount: number, total: number, merges: { card: string; added: string; existing: string; existingCard: string }[]): string {
  return [
    "# AI-utvärdering: mergeThings",
    "",
    `- Tid: ${new Date().toISOString()}`,
    `- Leverantör: ${env.AI_PROVIDER}`,
    `- Modell: ${env.AI_MODEL ?? "–"}`,
    `- Listor från: ${fixtureModel} (${cardCount} kort, ${total} föremål)`,
    `- Sammanslagningar: ${merges.length} (kvar: ${total - merges.length})`,
    "",
    "Bedöm för hand: är varje par samma fysiska föremål, och är några uppenbara dubbletter kvar?",
    "",
    "| Kort | Nytt föremål | = Befintligt föremål | Befintligt kort |",
    "| --- | --- | --- | --- |",
    ...merges.map((merge) => `| ${merge.card} | ${merge.added} | ${merge.existing} | ${merge.existingCard} |`),
    "",
  ].join("\n");
}
