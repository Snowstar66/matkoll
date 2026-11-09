import { writeFileSync } from "node:fs";
import { afterAll, describe, it } from "vitest";
import { normalizeUnit } from "@/features/catalog";
import { fromAiRecipe } from "@/features/recipes/domain/from-ai-recipe";
import { createAiService } from "@/server/ai/service";
import { parseEnv } from "@/server/env-schema";

// `pnpm eval:ai -- recipe-units`: how often an imported line loses its amount or
// unit. About twenty typical sources (Swedish sites, American blogs, TikTok and
// Instagram captions, a cookbook page read as text), each parsed with the real
// AI port, then read the way the import reads it (fromAiRecipe). Every source
// line is marked by hand with what it holds:
//   "-" no amount in the source ("Mjölk", "salt")   "#" a count only ("2 ägg")
//   no marker: an amount with a unit ("2 dl mjölk").
// Each answer line is matched to its source line and counted: what the model
// said (raw), and what is stored (after fromAiRecipe). Costs money; never in CI.
// Set UNITS_OUT to also write the per-line result as JSON.

type Source = { name: string; header?: string; lines: string[]; steps: string[] };

const steps = ["Blanda allt.", "Tillaga och servera."];
const SOURCES: Source[] = [
  {
    name: "ica-kottfarssas",
    header: "Köttfärssås (4 portioner)",
    lines: ["500 g nötfärs", "#1 gul lök", "2 vitlöksklyftor", "1 burk krossade tomater (400 g)", "2 msk tomatpuré", "1 dl vatten", "1 krm kanel", "-Salt", "-Svartpeppar", "-Olivolja till stekning"],
    steps,
  },
  {
    name: "arla-pannkakor",
    header: "Pannkakor, 4 portioner",
    lines: ["3 dl vetemjöl", "6 dl mjölk", "#3 ägg", "0,5 tsk salt", "2 msk smör", "-Sylt och grädde till servering"],
    steps,
  },
  {
    name: "koket-pasta",
    header: "Krämig pasta med skinka",
    lines: ["400 g pasta", "2 dl matlagningsgrädde", "1 förp skinktärningar", "1 näve spenat", "1 nypa muskot", "2 dl riven ost", "-Svartpeppar", "ca 1 kvist timjan"],
    steps,
  },
  {
    name: "se-soppa-glas-bit",
    header: "Rotfruktssoppa",
    lines: ["1 bit ingefära (ca 3 cm)", "2 glas vatten", "#1 stor morot", "#1 palsternacka", "1 liten kvist rosmarin", "1 bunt persilja", "1 huvud vitlök", "#2 gula lökar", "-Mjölk", "-Ost till gratinering"],
    steps,
  },
  {
    name: "se-burk-pase",
    header: "Chiligryta",
    lines: ["2 burkar kidneybönor", "1 påse ris", "1 flaska passerade tomater", "1 ask champinjoner", "1 tsk chilipulver", "1 tsk spiskummin", "#1 röd paprika", "-Koriander"],
    steps,
  },
  {
    name: "us-pancakes",
    header: "Fluffy Pancakes (serves 4)",
    lines: ["2 cups all-purpose flour", "2 tbsp sugar", "1 tbsp baking powder", "1/2 tsp salt", "1 3/4 cups milk", "#2 eggs", "1/4 cup melted butter", "1 tsp vanilla extract"],
    steps,
  },
  {
    name: "us-chili",
    header: "Weeknight Chili",
    lines: ["1 lb ground beef", "1 can (15 oz) kidney beans", "1 can diced tomatoes", "#1 medium onion, diced", "3 cloves garlic, minced", "2 tbsp chili powder", "1 tsp cumin", "-Salt and pepper to taste", "8 oz cheddar, shredded"],
    steps,
  },
  {
    name: "us-cookies",
    header: "Chocolate Chip Cookies",
    lines: ["1 stick butter, softened", "1 cup brown sugar", "1/2 cup white sugar", "#2 large eggs", "2 1/4 cups flour", "12 oz chocolate chips", "a pinch of salt", "-A handful of walnuts"],
    steps,
  },
  {
    name: "us-drink-flozs",
    header: "Whisky sour",
    lines: ["2 fl oz bourbon", "1 fl oz lemon juice", "3/4 oz simple syrup", "-ice", "1 bunch fresh mint"],
    steps,
  },
  {
    name: "tiktok-carbonara",
    header: "CARBONARA på 10 min 🍝🔥 spara!!",
    lines: ["🍝 200g pasta", "🥓 100g bacon", "🥚 2 eggs + 1 yolk", "🧀 1 cup parmesan", "-🧂 salt & pepper", "-some butter"],
    steps,
  },
  {
    name: "tiktok-bakadpotatis",
    header: "bakad potatis 😍 recept i bion",
    lines: ["• 4 stora potatisar", "• 2 msk olivolja", "• 1 dl crème fraiche", "• 1 näve riven ost", "-• gräslök", "-• flingsalt"],
    steps,
  },
  {
    name: "insta-smoothie",
    header: "Min morgon-smoothie 💚 #smoothie",
    lines: ["#1 banan", "1 cup frozen berries", "1 handful spinach", "1 tbsp chia seeds", "1 glas havremjölk", "-lite honung"],
    steps,
  },
  {
    name: "insta-kyckling",
    header: "Veckans middag: kycklinggryta 🍗",
    lines: ["500g kyckling", "1 burk kokosmjölk", "2 msk currypasta", "2 klyftor vitlök", "1 bit ingefära", "-ris till servering", "-lite lime"],
    steps,
  },
  {
    name: "insta-slarvig",
    header: "snabb lunch 🥗",
    lines: ["#2 eggs", "#1 avokado", "2 skivor bröd", "-some olive oil", "-lite salt", "200g halloumi", "ett par kvistar persilja"],
    steps,
  },
  {
    name: "kokbok-sida-1",
    header: "Ugnsbakad lax med dillsås",
    lines: ["800 g laxfilé", "2 dl crème fraiche", "1 dillknippe", "1 msk dijonsenap", "#saften av 1/2 citron", "-Salt", "-Peppar", "ca 1 tsk socker"],
    steps,
  },
  {
    name: "kokbok-sida-2",
    header: "Gammaldags kålpudding",
    lines: ["#1 vitkålshuvud (ca 1 kg)", "500 g blandfärs", "1 dl ris", "2 dl mjölk", "1 tsk salt", "1 krm vitpeppar", "2 msk sirap", "50 g smör", "-Lingonsylt"],
    steps,
  },
  {
    name: "se-intervall-brk",
    header: "Fiskgratäng",
    lines: ["2-3 dl grädde", "600 g torskfilé", "1 1/2 dl riven ost", "#½ citron", "1 tsk fänkålsfrö", "en skvätt vitvin", "1 näve dill"],
    steps,
  },
  {
    name: "se-bakning",
    header: "Kanelbullar",
    lines: ["50 g jäst", "5 dl mjölk", "150 g smör", "1 dl socker", "ca 14 dl vetemjöl", "1 tsk kardemumma", "#1 ägg", "2 msk pärlsocker"],
    steps,
  },
  {
    name: "se-blandat-slarv",
    header: "Wokad nudelsallad",
    lines: ["1 paket nudlar", "-Sesamolja", "2 msk soja", "1 knippe salladslök", "#1 lime", "-Sriracha efter smak", "1 näve cashewnötter", "1 nypa socker", "#½ gurka"],
    steps,
  },
  {
    name: "foto-liknande-text",
    header: "INGREDIENSER 4 port.\n(OCR-text från en bild)",
    lines: ["400 g spaghetti", "2 dl grädde", "100 g parmesan", "1 pkt bacon (140 g)", "1 st lök", "2 vitlöksklyftor", "-peppar", "salt"],
    steps,
  },
];

type Kind = "none" | "count" | "unit";
const kindOf = (line: string): { kind: Kind; text: string } =>
  line.startsWith("-") ? { kind: "none", text: line.slice(1) } : line.startsWith("#") ? { kind: "count", text: line.slice(1) } : { kind: "unit", text: line };

/** Letters and digits only, for matching an answer line to its source line. */
const squash = (text: string) => text.normalize("NFC").toLocaleLowerCase("sv-SE").replace(/[^\p{L}\p{N}]+/gu, "");

const env = parseEnv(process.env);
if (env.AI_PROVIDER === "mock") throw new Error("recipe-units needs a real model: set AI_PROVIDER.");
const service = createAiService(env);

type Row = { source: string; text: string; src: Kind; rawAmount: number | null; rawUnit: string | null; rawVague: boolean; amount: number | null; unit: string | null; isVague: boolean; verdict: string; rawVerdict: string };
const rows: Row[] = [];

function verdictOf(src: Kind, amount: number | null, unit: string | null, rawUnitKnown: boolean, rawAmount: number | null): string {
  if (src === "none") return amount === null ? "ingen mängd i källan (rimligt vag)" : "mängd trots att källan saknar (gissad)";
  if (amount === null) return rawAmount !== null && !rawUnitKnown ? "BUGG: enhet okänd, mängd tappad" : "BUGG: mängd i källan, null i svaret";
  if (src === "unit" && unit === null) return "mängd utan enhet";
  return "ok";
}

describe(`recipe-units mot ${env.AI_PROVIDER}`, () => {
  it.each(SOURCES.map((source) => [source.name, source] as const))("%s", async (_name, source) => {
    const marked = source.lines.map(kindOf);
    const text = `${source.header ?? ""}\n\nIngredienser\n${marked.map((line) => line.text).join("\n")}\n\nGör så här\n${source.steps.map((step, i) => `${i + 1}. ${step}`).join("\n")}`;
    const result = await service.parseRecipe({ text }, AbortSignal.timeout(120_000));
    if (!result.ok) {
      console.log(`${source.name}: ${result.error.code}`);
      return;
    }
    const ai = result.data;
    const draft = fromAiRecipe(ai, ai.ingredients.map(() => ({ kind: "unmatched" as const })), { kind: "text" });
    ai.ingredients.forEach((line, index) => {
      const squashed = squash(line.originalText);
      const overlaps = (entry: { text: string }) => {
        const target = squash(entry.text);
        return target !== "" && (target.includes(squashed) || squashed.includes(target));
      };
      const found = marked.find((entry) => squash(entry.text) === squashed) ?? marked.find(overlaps);
      const stored = draft.lines[index];
      const src = found?.kind ?? "unit";
      const rawKnown = normalizeUnit(line.unit).known;
      rows.push({
        source: source.name,
        text: line.originalText,
        src,
        rawAmount: line.amount,
        rawUnit: line.unit,
        rawVague: line.isVague,
        amount: stored.amount,
        unit: stored.unit,
        isVague: stored.isVague,
        verdict: found ? verdictOf(src, stored.amount, stored.unit, rawKnown, line.amount) : "omatchad rad",
        rawVerdict: found ? verdictOf(src, line.amount, line.unit, true, line.amount) : "omatchad rad",
      });
    });
  });
});

afterAll(() => {
  const count = (key: "verdict" | "rawVerdict") => {
    const map = new Map<string, number>();
    for (const row of rows) map.set(row[key], (map.get(row[key]) ?? 0) + 1);
    return [...map].sort().map(([name, n]) => `| ${name} | ${n} |`).join("\n");
  };
  const unknownUnits = new Map<string, number>();
  for (const row of rows) if (row.rawUnit && !normalizeUnit(row.rawUnit).known) unknownUnits.set(row.rawUnit, (unknownUnits.get(row.rawUnit) ?? 0) + 1);
  console.log(`\nModell: ${env.AI_MODEL ?? "–"}, ${rows.length} rader\n\nLagrat (efter importen)\n| Utfall | Rader |\n| --- | --- |\n${count("verdict")}\n\nSvaret från modellen (rått)\n| Utfall | Rader |\n| --- | --- |\n${count("rawVerdict")}\n\nOkända enheter i svaren: ${JSON.stringify([...unknownUnits])}\n`);
  const bad = rows.filter((row) => row.verdict.startsWith("BUGG") || row.verdict === "mängd utan enhet");
  console.log(bad.map((row) => `${row.source}: "${row.text}" raw=${row.rawAmount}/${row.rawUnit}/vag=${row.rawVague} → ${row.verdict}`).join("\n"));
  if (process.env.UNITS_OUT) writeFileSync(process.env.UNITS_OUT, JSON.stringify(rows, null, 2));
});
