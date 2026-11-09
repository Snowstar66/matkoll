import { z } from "zod";
import { normalizeIngredientText } from "@/features/catalog";
import { fitNotesSchema } from "./fit";

// "Idéer" of "Vad kan jag laga nu?" (Story 25.4): the model answers like a
// friend, and the code keeps it honest. An idea may only lean on what is at
// home (the pantry and the household's Basvaror), may miss one thing at most,
// and says which. Pure, so it is tested without a database or a model.

/** The kinds an idea is told apart by, as the sheet writes them in small letters. */
export const nowIdeaKinds = ["rätt", "tillbehör", "sås", "mellanmål", "frukost"] as const;

/** One idea as the job's result and the sheet hold it. */
export const nowIdeaSchema = z.object({
  name: z.string().min(1).max(100),
  how: z.string().min(1).max(300),
  /** One short sentence on why this idea ("Använder grädden som legat längst."); empty when the model gave none. */
  why: z.string().max(300).default(""),
  kind: z.enum(nowIdeaKinds),
  /** What is at home that the idea uses, as the model named it. */
  uses: z.array(z.string().max(100)).max(8),
  /** What it needs that is not at home: empty (all at home) or one name; ideas that miss more are left out. */
  missing: z.array(z.string().max(100)).max(1),
  /** Hushållets preferenser: what the idea says about someone's "Undviker" or "Älskar" (an allergy leaves the idea out); left out for none. */
  fit: fitNotesSchema,
});
export type NowIdeaView = z.infer<typeof nowIdeaSchema>;

/** The result of a job of mode `ideas`: the intro and the ideas that passed the check. */
export const nowIdeasResultSchema = z.object({
  intro: z.string().max(400),
  ideas: z.array(nowIdeaSchema).min(1).max(4),
  siteId: z.uuid().nullable().default(null),
});
export type NowIdeasResultView = z.infer<typeof nowIdeasResultSchema>;

/** An idea as the model gave it. */
export type RawNowIdea = { name: string; how: string; why?: string; kind: NowIdeaView["kind"]; uses: string[]; missing: string[] };

/** Things that count as at home without being in the pantry. */
const alwaysHome = new Set(["salt", "peppar", "olja", "vatten"]);

/**
 * Main ingredients that often name a dish: a word of the idea's name that starts with `name` (so "köttfärssås" and
 * "kycklinggryta" count, "färsk" and "äggplanta" do not) needs something at home that matches `covered`. The model
 * once used korv and named the dish after köttfärs ("Spagetti och köttfärssås"); a name must describe what is used.
 */
const mainWords: readonly { name: RegExp; covered: RegExp }[] = [
  { name: /^(?:kött|nöt|blandad?|fläsk|lamm|kalv|vego|quorn)?färs(?!k)/, covered: /färs/ },
  { name: /^kyckling/, covered: /kyckling/ },
  { name: /^lax/, covered: /lax/ },
  { name: /^fisk(?!e)/, covered: /fisk|lax|torsk|sej|sill|makrill|rödspätta|abborre|gös|strömming|röding/ },
  { name: /^torsk/, covered: /torsk/ },
  { name: /^fläsk/, covered: /fläsk|bacon/ },
  { name: /^bacon/, covered: /bacon/ },
  { name: /^skink/, covered: /skink/ },
  { name: /^biff/, covered: /biff|nötkött|entrecôte|oxfilé|högrev|rostbiff/ },
  { name: /^oxfil/, covered: /oxfil/ },
  { name: /^räk/, covered: /räk/ },
  { name: /^tonfisk/, covered: /tonfisk/ },
  { name: /^korv/, covered: /korv/ },
  { name: /^halloumi/, covered: /halloumi/ },
  { name: /^tofu/, covered: /tofu/ },
  { name: /^ägg(?!planta)/, covered: /ägg/ },
  { name: /^lamm/, covered: /lamm/ },
  { name: /^anka/, covered: /anka|and(?:bröst|lår)/ },
];

/**
 * True when the idea's name mentions a main ingredient (mainWords) that is neither among what it uses or misses nor
 * at home (`homeNames`, normalized): the name then says something the idea does not do.
 */
export function nameMentionsOther(name: string, named: readonly string[], homeNames: readonly string[]): boolean {
  const have = [...named, ...homeNames].map((entry) => entry.toLocaleLowerCase("sv"));
  const words = name.toLocaleLowerCase("sv").split(/[^\p{L}]+/u).filter((word) => word !== "");
  return words.some((word) => mainWords.some((main) => main.name.test(word) && !have.some((entry) => main.covered.test(entry))));
}

/** The names the check asks `atHome` about: every use and missing of the ideas, each once, normalized. */
export function namesToCheck(ideas: readonly RawNowIdea[]): string[] {
  const names = new Set<string>();
  for (const idea of ideas) for (const name of [...idea.uses, ...idea.missing]) names.add(normalizeIngredientText(name) || name.trim().toLocaleLowerCase("sv"));
  return [...names].filter((name) => name !== "" && !alwaysHome.has(name));
}

/** Names in the check's own key: normalized, or just lower case when the catalog's normalizing leaves nothing. */
function keyOf(name: string): string {
  return normalizeIngredientText(name) || name.trim().toLocaleLowerCase("sv");
}

/**
 * The ideas that hold, each with what is really at home in `uses` and what is
 * not in `missing`:
 * - a name in `uses` that is not at home moves to `missing` (the idea leans on it);
 * - a name in `missing` that is at home moves to `uses`;
 * - salt, pepper, oil and water are at home and are not listed;
 * - an idea that misses more than one thing, or uses nothing that is at home, is left out.
 * - an idea whose name mentions a main ingredient it does not use (`nameMentionsOther`) is left out; `onDrop` hears of it as "name".
 * `atHome` is given the key of a name (see `namesToCheck`); `homeNames` are the names at home, for the name check.
 */
export function checkNowIdeas(
  ideas: readonly RawNowIdea[],
  atHome: (key: string) => boolean,
  homeNames: readonly string[] = [],
  onDrop: (reason: "name") => void = () => {},
): NowIdeaView[] {
  const kept: NowIdeaView[] = [];
  for (const idea of ideas) {
    const uses = new Map<string, string>();
    const missing = new Map<string, string>();
    for (const name of [...idea.uses, ...idea.missing]) {
      const key = keyOf(name);
      if (key === "" || alwaysHome.has(key)) continue;
      (atHome(key) ? uses : missing).set(key, name);
    }
    if (uses.size === 0 || missing.size > 1) continue;
    if (nameMentionsOther(idea.name, [...uses.values(), ...missing.values()], homeNames)) {
      onDrop("name");
      continue;
    }
    kept.push({ name: idea.name, how: idea.how, why: idea.why ?? "", kind: idea.kind, uses: [...uses.values()], missing: [...missing.values()] });
  }
  return kept;
}
