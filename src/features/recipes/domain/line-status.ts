import { savingKronor, textUnitPrice } from "@/features/offers";
import type { LineCoverage, RecipeStatus } from "@/features/pantry";
import type { SavedRecipeLine } from "./saved-recipe";

// What the recipe shows per ingredient (Story 25.1): hemma, "Saknas" or "På
// listan", the offer with what it saves, and the sums the chips and the
// buttons say. Pure, so it is tested without a browser.

/** The best offer for one catalog ingredient, as the recipe's rows say it. */
export type LineOffer = {
  /** The store's name ("ICA Maxi"). */
  store: string;
  /** The price as the store wrote it ("29 kr/st"), or `null`. */
  price: string | null;
  /** The saving in whole kronor when it can be counted, else `null`. */
  savingKr: number | null;
  /** The saving in whole percent when kronor cannot be counted, else `null`. */
  savingPercent: number | null;
};

/** The parts of a store offer this reads; a StoreOffer fits. */
export type OfferSource = {
  ingredientId: string | null;
  storeId: string;
  price: string | null;
  regularPrice: number | null;
  savingPercent: number | null;
};

/**
 * The best offer for each catalog ingredient, by ingredient id: the one that
 * saves most in kronor, else the one that saves most in percent, else the
 * first. Kronor is the regular price minus the price per item or kg read from
 * the offer's text (never a guess: no price to compare, no kronor); otherwise
 * the saving is the offer's percent, and an offer without either still shows.
 */
export function lineOffers(
  offers: readonly OfferSource[],
  storeNames: ReadonlyMap<string, string>,
): Record<string, LineOffer> {
  const best: Record<string, LineOffer> = {};
  for (const offer of offers) {
    if (!offer.ingredientId) continue;
    const unitPrice = textUnitPrice(offer.price);
    const kr = offer.regularPrice !== null && unitPrice !== null ? savingKronor(offer.regularPrice, unitPrice) : null;
    const savingKr = kr !== null && Math.round(kr) >= 1 ? Math.round(kr) : null;
    const candidate: LineOffer = {
      store: storeNames.get(offer.storeId) ?? "",
      price: offer.price,
      savingKr,
      savingPercent: savingKr === null ? offer.savingPercent : null,
    };
    const current = best[offer.ingredientId];
    if (!current || rank(candidate) > rank(current)) best[offer.ingredientId] = candidate;
  }
  return best;
}

function rank(offer: LineOffer): number {
  if (offer.savingKr !== null) return 1000 + offer.savingKr;
  return offer.savingPercent ?? 0;
}

/** "spara 12 kr", "spara 20 %", or `null` when the offer's saving is not known. */
export function savingPhrase(offer: Pick<LineOffer, "savingKr" | "savingPercent">): string | null {
  if (offer.savingKr !== null) return `spara ${offer.savingKr} kr`;
  if (offer.savingPercent !== null) return `spara ${offer.savingPercent} %`;
  return null;
}

/** The row's offer line: "Erbjudande ICA Maxi · 29 kr/st, spara 12 kr". */
export function offerLineText(offer: LineOffer): string {
  const head = offer.store ? `Erbjudande ${offer.store}` : "Erbjudande";
  const withPrice = offer.price ? `${head} · ${offer.price}` : head;
  const saving = savingPhrase(offer);
  return saving ? `${withPrice}, ${saving}` : withPrice;
}

/** The sheet's offer tag on a row: "Erbjudande · spara 12 kr". */
export function offerTagText(offer: LineOffer): string {
  const saving = savingPhrase(offer);
  return saving ? `Erbjudande · ${saving}` : "Erbjudande";
}

/** What a recipe line shows: at home, missing, missing but on the list, or nothing (not compared). */
export type LineState = {
  kind: "home" | "missing" | "listed" | "none";
  /** At home because the household's Basvaror say so. */
  staple: boolean;
  /** The offer on a line that is missing or on the list; `null` for a line at home. */
  offer: LineOffer | null;
};

function isHome(coverage: LineCoverage | undefined): boolean {
  return coverage?.kind === "covered";
}

/**
 * Each line's state by line id. A line is missing when its catalog ingredient
 * counts in the status's missing ones, or it is a vague line whose ingredient
 * is not at home (never counted in N or bought); a line without an ingredient
 * is never compared. A missing line whose ingredient stands on the
 * shopping list is "På listan". The offer follows the ingredient.
 */
export function lineStates(
  lines: readonly SavedRecipeLine[],
  status: RecipeStatus,
  listedIngredientIds: ReadonlySet<string>,
  offers: Readonly<Record<string, LineOffer>>,
): Record<string, LineState> {
  const missing = new Set(status.missingIngredientIds);
  const states: Record<string, LineState> = {};
  for (const line of lines) {
    const coverage = status.lines[line.id];
    const id = line.ingredientId;
    if (isHome(coverage)) {
      states[line.id] = { kind: "home", staple: coverage?.kind === "covered" && Boolean(coverage.staple), offer: null };
    } else if (id && (missing.has(id) || (line.isVague && coverage && coverage.kind !== "unlinked"))) {
      // A vague line ("salt efter smak") whose ingredient is not at home is ringed too, though it never counts in N or in the buy list.
      states[line.id] = { kind: listedIngredientIds.has(id) ? "listed" : "missing", staple: false, offer: offers[id] ?? null };
    } else {
      states[line.id] = { kind: "none", staple: false, offer: null };
    }
  }
  return states;
}

/** One thing to buy: a missing ingredient, once, with the line it is shown on. */
export type MissingItem = {
  ingredientId: string;
  /** The catalog name, which is the list item's text. */
  name: string;
  /** The recipe line's amount, scaled, for the sheet's row. */
  lineId: string;
  offer: LineOffer | null;
};

/** The missing ingredients not on the list yet, once each, in the recipe's order. */
export function itemsToBuy(
  lines: readonly SavedRecipeLine[],
  states: Readonly<Record<string, LineState>>,
): MissingItem[] {
  const seen = new Set<string>();
  const items: MissingItem[] = [];
  for (const line of lines) {
    const state = states[line.id];
    if (state?.kind !== "missing" || line.isVague || !line.ingredientId || !line.ingredientName || seen.has(line.ingredientId)) continue;
    seen.add(line.ingredientId);
    items.push({ ingredientId: line.ingredientId, name: line.ingredientName, lineId: line.id, offer: state.offer });
  }
  return items;
}

export type LineSummary = {
  /** Distinct ingredients on the list that the recipe misses. */
  listed: number;
  /** Distinct missing or listed ingredients that are on offer. */
  onOffer: number;
  /** What those offers save in whole kronor, the ones whose saving is counted in kronor. */
  savingKr: number;
};

export function summarizeLines(lines: readonly SavedRecipeLine[], states: Readonly<Record<string, LineState>>): LineSummary {
  const listed = new Set<string>();
  const offered = new Map<string, LineOffer>();
  for (const line of lines) {
    const state = states[line.id];
    if (!state || !line.ingredientId || line.isVague) continue;
    if (state.kind === "listed") listed.add(line.ingredientId);
    if ((state.kind === "listed" || state.kind === "missing") && state.offer) offered.set(line.ingredientId, state.offer);
  }
  let savingKr = 0;
  for (const offer of offered.values()) savingKr += offer.savingKr ?? 0;
  return { listed: listed.size, onOffer: offered.size, savingKr };
}

/** "2 på erbjudande · spara 21 kr"; without a counted saving only "2 på erbjudande". */
export function offerChipText({ onOffer, savingKr }: Pick<LineSummary, "onOffer" | "savingKr">): string {
  return savingKr > 0 ? `${onOffer} på erbjudande · spara ${savingKr} kr` : `${onOffer} på erbjudande`;
}

/** "3 på inköpslistan". */
export function listedChipText(listed: number): string {
  return `${listed} på inköpslistan`;
}

/** The chip for the recipe on the meal plan: "På matsedeln denna vecka" or "På matsedeln på onsdag". */
export function plannedChipText(weekdayWord: string | null): string {
  return weekdayWord ? `På matsedeln på ${weekdayWord}` : "På matsedeln denna vecka";
}

/**
 * The line under the ingredients: "Salt, peppar och smör är Basvaror och räknas
 * som hemma." Names from the lines at home by a Basvara, at most three, each
 * once; `null` when none is.
 */
export function staplesNote(lines: readonly SavedRecipeLine[], states: Readonly<Record<string, LineState>>): string | null {
  const names: string[] = [];
  for (const line of lines) {
    if (!states[line.id]?.staple) continue;
    const name = (line.ingredientName ?? line.originalText).trim().toLowerCase();
    if (name && !names.includes(name)) names.push(name);
  }
  if (names.length === 0) return null;
  const shown = names.slice(0, 3);
  const first = shown[0]!.charAt(0).toUpperCase() + shown[0]!.slice(1);
  const rest = [first, ...shown.slice(1)];
  if (names.length === 1) return `${first} är en Basvara och räknas som hemma.`;
  const list = names.length > 3 ? `${rest.join(", ")} m.fl.` : `${rest.slice(0, -1).join(", ")} och ${rest.at(-1)}`;
  return `${list} är Basvaror och räknas som hemma.`;
}

/** "Falukorv, grädde och ris", or "Falukorv, grädde, ris och 2 till": the names in the toast after "Lägg på matsedeln". */
export function namesText(names: readonly string[]): string {
  const shown = names.slice(0, 3).map((name, index) => (index === 0 ? name.charAt(0).toUpperCase() + name.slice(1) : name.toLowerCase()));
  if (names.length > 3) return `${shown.join(", ")} och ${names.length - 3} till`;
  if (shown.length <= 1) return shown.join("");
  return `${shown.slice(0, -1).join(", ")} och ${shown.at(-1)}`;
}

/** "Lägg 3 varor på listan", "Lägg 1 vara på listan"; "Välj minst en vara" with none. */
export function buyConfirmText(count: number): string {
  if (count === 0) return "Välj minst en vara";
  return `Lägg ${count} ${count === 1 ? "vara" : "varor"} på listan`;
}

/** "3 varor på inköpslistan." */
export function boughtText(count: number): string {
  return `${count} ${count === 1 ? "vara" : "varor"} på inköpslistan.`;
}

/** The toast after "Lägg på matsedeln": "På veckans matsedel. Falukorv, grädde och ris står på inköpslistan." */
export function plannedToastText(names: readonly string[]): string {
  return names.length > 0 ? `På veckans matsedel. ${namesText(names)} står på inköpslistan.` : "På veckans matsedel.";
}

/** The key addKeyedItems and removeKeyedItems share for one missing ingredient of one recipe. */
export function buyKey(recipeId: string, ingredientId: string): string {
  return `recipe:${recipeId}:${ingredientId}`;
}
