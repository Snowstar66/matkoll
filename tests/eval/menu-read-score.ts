// Scoring for `pnpm eval:menu`: compares step 1's reading of a menu with the ground truth.
import type { Allergen, Category, Group } from "./menus/menu-data.ts";

export type ReadDish = {
  originalnamn: string;
  grupp: string;
  forklaring: string;
  huvudingredienser: string[];
  kategori: string;
  allergener: string[];
  kan_innehalla: string[];
  pris: number | null;
  valuta: string | null;
};
export type MenuRead = {
  restaurang: string | null;
  sprak: string;
  ratter: ReadDish[];
  osakert: string[];
};
export type Truth = {
  id: string;
  language: "es" | "en" | "sv";
  degraded: boolean;
  currency: string;
  dishes: {
    name: string;
    price: number | null;
    currency: string;
    group: Group;
    category: Category;
    allergens: Allergen[];
    keywords: string[];
  }[];
};

export const allergenList = ["gluten", "laktos", "notter", "skaldjur", "agg", "fisk", "soja", "sesam"] as const;
export const categoryList = ["kott", "fisk", "skaldjur", "vegetariskt", "veganskt", "ej_tillampligt"] as const;
export const groupList = ["Förrätt", "Varmrätt", "Efterrätt", "Drycker", "Övrigt"] as const;

export const menuSchema = {
  type: "object",
  additionalProperties: false,
  required: ["restaurang", "sprak", "ratter", "osakert"],
  properties: {
    restaurang: { type: ["string", "null"] },
    sprak: { type: "string", enum: ["sv", "en", "es", "annat"] },
    ratter: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["originalnamn", "grupp", "forklaring", "huvudingredienser", "kategori", "allergener", "kan_innehalla", "pris", "valuta"],
        properties: {
          originalnamn: { type: "string" },
          grupp: { type: "string", enum: [...groupList] },
          forklaring: { type: "string" },
          huvudingredienser: { type: "array", items: { type: "string" } },
          kategori: { type: "string", enum: [...categoryList] },
          allergener: { type: "array", items: { type: "string", enum: [...allergenList] } },
          kan_innehalla: { type: "array", items: { type: "string", enum: [...allergenList] } },
          pris: { type: ["number", "null"] },
          valuta: { type: ["string", "null"] },
        },
      },
    },
    osakert: { type: "array", items: { type: "string" } },
  },
} as const;

/** Light validation of the parsed JSON (the API enforces the schema; this catches truncation and drift). */
export function validate(value: unknown): value is MenuRead {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<MenuRead>;
  if (!Array.isArray(v.ratter) || !Array.isArray(v.osakert) || typeof v.sprak !== "string") return false;
  return v.ratter.every(
    (d) =>
      typeof d?.originalnamn === "string" &&
      typeof d.forklaring === "string" &&
      Array.isArray(d.allergener) &&
      Array.isArray(d.kan_innehalla) &&
      (d.pris === null || typeof d.pris === "number") &&
      (d.valuta === null || typeof d.valuta === "string"),
  );
}

const norm = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^(mandag|tisdag|onsdag|torsdag|fredag|lordag|sondag|manday)\s*:\s*/, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

export function similarity(a: string, b: string): number {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const ratio = 1 - levenshtein(x, y) / Math.max(x.length, y.length);
  const contains = x.includes(y) || y.includes(x) ? 0.8 : 0;
  return Math.max(ratio, contains);
}

export type Match = { truthIndex: number; readIndex: number };

/** Greedy best-pair matching; a pair needs similarity of at least 0.6. */
export function matchDishes(truth: Truth, read: MenuRead): Match[] {
  const pairs: { t: number; r: number; s: number }[] = [];
  truth.dishes.forEach((t, ti) =>
    read.ratter.forEach((r, ri) => {
      const s = similarity(t.name, r.originalnamn);
      if (s >= 0.6) pairs.push({ t: ti, r: ri, s });
    }),
  );
  pairs.sort((p, q) => q.s - p.s);
  const usedT = new Set<number>();
  const usedR = new Set<number>();
  const out: Match[] = [];
  for (const p of pairs) {
    if (usedT.has(p.t) || usedR.has(p.r)) continue;
    usedT.add(p.t);
    usedR.add(p.r);
    out.push({ truthIndex: p.t, readIndex: p.r });
  }
  return out;
}

const groupMap: Record<Group, string> = {
  forratt: "Förrätt",
  varmratt: "Varmrätt",
  efterratt: "Efterrätt",
  drycker: "Drycker",
  ovrigt: "Övrigt",
};

export type Score = {
  truthCount: number;
  readCount: number;
  matched: number;
  priceCorrect: number;
  groupCorrect: number;
  allergenTp: number;
  allergenFn: number;
  allergenFp: number;
  /** Missed allergens that the model at least listed under kan_innehalla. */
  allergenFnSoft: number;
  categoryTotal: number;
  categoryCorrect: number;
  translationTotal: number;
  translationCorrect: number;
  misses: string[];
};

export function scoreMenu(truth: Truth, read: MenuRead): Score {
  const matches = matchDishes(truth, read);
  const s: Score = {
    truthCount: truth.dishes.length,
    readCount: read.ratter.length,
    matched: matches.length,
    priceCorrect: 0,
    groupCorrect: 0,
    allergenTp: 0,
    allergenFn: 0,
    allergenFp: 0,
    allergenFnSoft: 0,
    categoryTotal: 0,
    categoryCorrect: 0,
    translationTotal: 0,
    translationCorrect: 0,
    misses: [],
  };
  const matchedT = new Set(matches.map((m) => m.truthIndex));
  truth.dishes.forEach((t, i) => {
    if (!matchedT.has(i)) s.misses.push(`saknas: ${t.name}`);
  });
  for (const { truthIndex, readIndex } of matches) {
    const t = truth.dishes[truthIndex];
    const r = read.ratter[readIndex];
    const priceOk =
      t.price === null
        ? r.pris === null
        : r.pris !== null && Math.abs(r.pris - t.price) < 0.005 && (r.valuta ?? "").toUpperCase() === t.currency;
    if (priceOk) s.priceCorrect++;
    else s.misses.push(`pris: ${t.name} väntat ${t.price ?? "null"} ${t.currency}, fick ${r.pris ?? "null"} ${r.valuta ?? ""}`);
    if (r.grupp === groupMap[t.group]) s.groupCorrect++;
    const got = new Set(r.allergener);
    const maybe = new Set(r.kan_innehalla);
    for (const a of t.allergens) {
      if (got.has(a)) s.allergenTp++;
      else {
        s.allergenFn++;
        if (maybe.has(a)) s.allergenFnSoft++;
        s.misses.push(`ALLERGEN missad: ${t.name} (${a})${maybe.has(a) ? ", fanns i kan_innehalla" : ""}`);
      }
    }
    for (const a of got) if (!t.allergens.includes(a as Allergen)) s.allergenFp++;
    if (t.category !== null) {
      s.categoryTotal++;
      if (r.kategori === t.category) s.categoryCorrect++;
      else s.misses.push(`kategori: ${t.name} väntat ${t.category}, fick ${r.kategori}`);
    }
    s.translationTotal++;
    const text = norm(`${r.forklaring} ${r.huvudingredienser.join(" ")}`);
    if (t.keywords.some((k) => text.includes(norm(k)))) s.translationCorrect++;
    else s.misses.push(`översättning: ${t.name} saknar ${t.keywords.join("/")}: "${r.forklaring}"`);
  }
  return s;
}

export function addScores(a: Score, b: Score): Score {
  return {
    truthCount: a.truthCount + b.truthCount,
    readCount: a.readCount + b.readCount,
    matched: a.matched + b.matched,
    priceCorrect: a.priceCorrect + b.priceCorrect,
    groupCorrect: a.groupCorrect + b.groupCorrect,
    allergenTp: a.allergenTp + b.allergenTp,
    allergenFn: a.allergenFn + b.allergenFn,
    allergenFp: a.allergenFp + b.allergenFp,
    allergenFnSoft: a.allergenFnSoft + b.allergenFnSoft,
    categoryTotal: a.categoryTotal + b.categoryTotal,
    categoryCorrect: a.categoryCorrect + b.categoryCorrect,
    translationTotal: a.translationTotal + b.translationTotal,
    translationCorrect: a.translationCorrect + b.translationCorrect,
    misses: [...a.misses, ...b.misses],
  };
}

export const emptyScore = (): Score => ({
  truthCount: 0, readCount: 0, matched: 0, priceCorrect: 0, groupCorrect: 0, allergenTp: 0, allergenFn: 0,
  allergenFp: 0, allergenFnSoft: 0, categoryTotal: 0, categoryCorrect: 0, translationTotal: 0, translationCorrect: 0, misses: [],
});
