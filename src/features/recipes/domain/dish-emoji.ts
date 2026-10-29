// Story 16.4: the illustration of a recipe without a photo, an emoji for the
// dish's main ingredient. A small, explicit list: the first rule that matches
// the title wins, so a card, a suggestion and the recipe view show the same one.
// No image is made or fetched, so nothing is sent anywhere and nothing costs.

export const defaultDishEmoji = "🍽️";

/** In priority order: a dish "Kyckling med ris" is a chicken dish, "Fiskgryta" a fish dish. */
const rules: readonly { emoji: string; pattern: RegExp }[] = [
  { emoji: "🌮", pattern: /taco|tortilla|burrito|quesadilla|fajita/ },
  { emoji: "🐟", pattern: /fisk|lax|torsk|sej|sill|räk|tonfisk|makrill|kolja|röding|gös|skaldjur/ },
  { emoji: "🍗", pattern: /kyckling|kalkon|høns|höns/ },
  { emoji: "🌭", pattern: /korv|chorizo|prinskorv|falukorv/ },
  { emoji: "🥩", pattern: /\bnöt|färs|biff|fläsk|skinka|bacon|kött|karré|revben|oxe|lamm|entrecote|köttbull/ },
  { emoji: "🍲", pattern: /soppa|gryta|chili|stuvning/ },
  { emoji: "🍝", pattern: /pasta|spagetti|spaghetti|makaron|penne|tagliatelle|lasagne|fusilli|nudlar/ },
  { emoji: "🍚", pattern: /\bris|couscous|bulgur/ },
  { emoji: "🥔", pattern: /potatis|gratäng|pommes|rösti/ },
  { emoji: "🥗", pattern: /vegetar|vegan|grönsak|sallad|linser|bönor|kikärt|halloumi|tofu|quorn|ägg|omelett/ },
];

/** The dish's emoji from its title, else a plate. */
export function dishEmoji(title: string): string {
  const text = title.toLowerCase();
  return rules.find(({ pattern }) => pattern.test(text))?.emoji ?? defaultDishEmoji;
}

/** The sentence under the title of a recipe saved from the offers, or `null` for any other recipe. */
export function offerSavedText(offerNames: readonly string[] | undefined): string | null {
  const names = (offerNames ?? []).filter((name) => name.trim() !== "");
  return names.length > 0 ? `Sparad från veckans erbjudanden: ${names.join(", ")}` : null;
}
