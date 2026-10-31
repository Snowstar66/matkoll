// The library's categories (Story 1.17), worked out by rules from what a
// recipe already holds: no AI call, no column. One main protein, any number of
// dish types, and Snabbt from the time. Pure, so it is tested without a database.

export const RECIPE_CATEGORIES = ["meat", "poultry", "fish", "vegetarian", "pasta", "soup", "salad", "stew", "quick"] as const;
export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number];

/** The chip's and the heading's text for each category. */
export const recipeCategoryLabels: Record<RecipeCategory, string> = {
  meat: "Kött",
  poultry: "Fågel",
  fish: "Fisk & skaldjur",
  vegetarian: "Vegetariskt",
  pasta: "Pasta",
  soup: "Soppa",
  salad: "Sallad",
  stew: "Gryta",
  quick: "Snabbt",
};

/** A stored choice; anything else, or nothing, is no category. */
export function parseRecipeCategory(value: unknown): RecipeCategory | null {
  return RECIPE_CATEGORIES.find((category) => category === value) ?? null;
}

/** The most minutes a recipe may take to be Snabbt. */
export const quickMaxMinutes = 30;

type Protein = "meat" | "poultry" | "fish";

/** What the rules read: the title, the lines' texts ("2 dl kycklingbuljong") and the time. */
export type CategorizableRecipe = { title: string; ingredients: readonly string[]; totalMinutes: number | null };

/** Words of seasonings and the like: "kycklingbuljong" is not chicken. */
const seasoning = /buljong|fond$|^fond|kraft$|tärning|krydd|fisksås|ostronsås|worcester|anjovis|ansjovis/;
/** Words of a vegetarian substitute: "vegofärs" is not mince. */
const substitute = /vego|vegetar|veggie|soja|quorn|växtbaserad/;

// Prefixes and endings of the main raw materials. Poultry and fish are tried
// before meat, so "kycklingfärs" and "laxfärs" are not read as mince.
const poultryWords = /kyckling|höns|kalkon|^ank(a|bröst|lår|fil)|^gås|fågel/;
const fishWords =
  /lax|torsk|^sej|fisk|^räk|skaldjur|makrill|^sill|forell|röding|kolja|flundra|rödspätt|krabb|hummer|mussl|^ostron(?!skivling)|scampi|kräft|pangasius|tilapia|abborre|gädda|surimi/;
const meatWords =
  /kött|^nöt(färs|biff|filé|stek|gryt|högrev|bog|tunga)|biff|oxfilé|högrev|entrecote|entrecôte|lamm|fläsk|skinka|bacon|pancetta|prosciutto|salami|chorizo|korv|revben|kassler|kalv|vildsvin|^älg|^lever|kotlett|karré|färs$/;
const notMeat = /korvbröd|pastej/;

const pastaTypes =
  "pasta|spagetti|spaghetti|penne|tagliatelle|fusilli|makaroner|lasagne|tortellini|ravioli|gnocchi|linguine|fettuccine|farfalle|rigatoni|pappardelle|cannelloni|orzo";
/** In a title, "laxpasta" is a pasta dish. */
const pastaTitleWords = new RegExp(`(${pastaTypes})(r|n|na|skruvar|plattor)?$`);
/** On a line, only the pasta itself: "chipotlepasta" is a paste, and "spagetti pumpa" a squash. */
const pastaLineWords = new RegExp(`^(fullkorns?|ägg|durum|glutenfri\\w*|vete|färsk|torkad)?(${pastaTypes})(r|n|na|skruvar|plattor)?$`);
const notPasta = /pumpa|squash/;
const soupWords = /soppa|soppor|chowder|gazpacho|bisque|minestrone/;
const saladWords = /sallad|caesar|coleslaw|tabbouleh|slaw/;
/** A dressing says "Sallad" too; "salladsblad" in a burger does not. */
const dressingWords = /caesar/;
const stewWords = /gryta|grytor|stroganoff|ragu|ragù|^curry|tagine|gulasch|korma|^chili$|lapskojs|bourguignon/;

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-zåäöéèü]+/g) ?? [];
}

/** The protein one word names, if any; none for a seasoning or a substitute. */
function proteinOf(word: string): Protein | null {
  if (seasoning.test(word) || substitute.test(word)) return null;
  if (poultryWords.test(word)) return "poultry";
  if (fishWords.test(word)) return "fish";
  if (meatWords.test(word) && !notMeat.test(word)) return "meat";
  return null;
}

/** Ties between lines go to meat, then poultry, then fish. */
const proteinOrder: readonly Protein[] = ["meat", "poultry", "fish"];

/**
 * The main protein: the first one the title names, else the one most lines
 * name; Vegetariskt when nothing names meat, poultry or fish.
 */
function mainProtein(recipe: CategorizableRecipe): Protein | "vegetarian" {
  for (const word of words(recipe.title)) {
    const protein = proteinOf(word);
    if (protein) return protein;
  }
  const counts: Record<Protein, number> = { meat: 0, poultry: 0, fish: 0 };
  for (const line of recipe.ingredients) {
    // A line counts once for each protein it names.
    for (const protein of new Set(words(line).map(proteinOf))) if (protein) counts[protein] += 1;
  }
  const best = proteinOrder.reduce((top, protein) => (counts[protein] > counts[top] ? protein : top));
  return counts[best] > 0 ? best : "vegetarian";
}

/**
 * The categories of a recipe: its protein first, then its dish types (Pasta
 * from the title or ingredients, Sallad from the title or a dressing, Soppa
 * and Gryta from the title), and Snabbt last when it takes at most 30 minutes; no time (or 0) is not Snabbt.
 */
export function recipeCategories(recipe: CategorizableRecipe): RecipeCategory[] {
  const title = words(recipe.title);
  const categories: RecipeCategory[] = [mainProtein(recipe)];
  const pastaLines = recipe.ingredients.filter((line) => !notPasta.test(line.toLowerCase()));
  if (
    title.some((word) => pastaTitleWords.test(word) && !notPasta.test(word)) ||
    pastaLines.some((line) => words(line).some((word) => pastaLineWords.test(word)))
  ) {
    categories.push("pasta");
  }
  if (title.some((word) => soupWords.test(word))) categories.push("soup");
  if (title.some((word) => saladWords.test(word)) || recipe.ingredients.some((line) => words(line).some((word) => dressingWords.test(word)))) {
    categories.push("salad");
  }
  if (title.some((word) => stewWords.test(word))) categories.push("stew");
  if (recipe.totalMinutes && recipe.totalMinutes <= quickMaxMinutes) categories.push("quick");
  return categories;
}
