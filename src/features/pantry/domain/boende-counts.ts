// What each boende holds, in words (Story 16.14): the short line in the boende
// menu, and the longer one on the cards in Inställningar → Boenden. Pure.
import { thingCountText, thingNoun } from "@/lib/thing-noun";

/** What a boende holds: matvaror, prylar (things) and the cards (photos) of Förråd. */
export type BoendeCounts = { items: number; things: number; cards: number };

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** For the menu: only what exists ("5 varor", "18 prylar", "30 varor · 4 prylar"); "Tomt" when nothing does. */
export function boendeMenuText(counts: BoendeCounts): string {
  const parts = [
    counts.items > 0 ? plural(counts.items, "vara", "varor") : null,
    counts.things > 0 ? thingCountText(counts.things) : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Tomt";
}

/** For the cards: "30 matvaror · inga prylar än", "Inga matvaror · 18 prylar · 1 kort". */
export function boendeCardText(counts: BoendeCounts): string {
  const items = counts.items > 0 ? plural(counts.items, "matvara", "matvaror") : "Inga matvaror";
  if (counts.things === 0 && counts.cards === 0) return `${items} · inga ${thingNoun.plural} än`;
  const parts = [items, counts.things > 0 ? thingCountText(counts.things) : null, counts.cards > 0 ? plural(counts.cards, "kort", "kort") : null];
  return parts.filter(Boolean).join(" · ");
}

export const boendeButtonLabel = "Byt boende";
export const boendeSheetTitle = "Boende";
export const manageBoendenText = "Hantera boenden";
export const settingsExplainText = "Det valda boendet gäller i hela appen.";
export const selectedBoendeBadge = "Vald";
