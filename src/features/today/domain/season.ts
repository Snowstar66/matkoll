// What is in season in Sweden, by month: a fixed editorial list of the produce Swedes
// know as that time's own (Swedish harvest, plus citrus in the winter when it peaks
// further south). The first item that one of the household's recipes uses is named.
// `stems` are matched inside the recipe title, so "pump" finds "Spagettipumpa".

export type SeasonItem = {
  /** The definite form, which starts the sentence: "Pumpan". */
  definite: string;
  stems: readonly string[];
};

const item = (definite: string, ...stems: string[]): SeasonItem => ({ definite, stems });

const roots = item("Rotfrukterna", "rotfrukt", "morot", "morötter", "palsternack", "rödbet", "rotselleri", "kålrot");
const cabbage = item("Kålen", "kål");
const citrus = item("Citrusfrukterna", "citron", "apelsin", "lime", "clementin");
const pumpkin = item("Pumpan", "pump");
const mushrooms = item("Svampen", "svamp", "kantarell", "champinjon", "karljohan");
const apple = item("Äpplena", "äpple", "äppel");
const pear = item("Päronen", "päron");
const plum = item("Plommonen", "plommon");
const leek = item("Purjolöken", "purjolök");
const rhubarb = item("Rabarbern", "rabarber");
const asparagus = item("Sparrisen", "sparris");
const radish = item("Rädisorna", "rädis");
const strawberry = item("Jordgubbarna", "jordgubb");
const newPotato = item("Nypotatisen", "nypotatis");
const zucchini = item("Zucchinin", "zucchini");
const cucumber = item("Gurkan", "gurk");
const tomato = item("Tomaterna", "tomat");
const blueberry = item("Blåbären", "blåbär");
const corn = item("Majsen", "majs");
const peas = item("Ärterna", "ärt");

/** Index 0 is January. Order matters: the first match with a recipe wins. */
export const seasonByMonth: readonly (readonly SeasonItem[])[] = [
  [cabbage, roots, citrus],
  [cabbage, roots, citrus],
  [roots, cabbage, leek],
  [rhubarb, leek, roots],
  [asparagus, rhubarb, radish],
  [strawberry, newPotato, asparagus, peas],
  [strawberry, newPotato, blueberry, zucchini, cucumber, tomato],
  [mushrooms, blueberry, corn, zucchini, tomato, plum],
  [mushrooms, apple, pear, plum, pumpkin, cabbage],
  [pumpkin, apple, pear, mushrooms, cabbage, roots],
  [pumpkin, cabbage, roots],
  [cabbage, roots, citrus],
];

export type SeasonRecipe = { id: string; title: string };

export type SeasonLine = { item: SeasonItem; recipe: SeasonRecipe | null };

/** The seasonal line for a month: the first item a recipe uses, else the month's first item alone. */
export function seasonLine(month: number, recipes: readonly SeasonRecipe[]): SeasonLine | null {
  const items = seasonByMonth[month - 1];
  if (!items) return null;
  for (const candidate of items) {
    const recipe = recipes.find((entry) => {
      const title = entry.title.toLowerCase();
      return candidate.stems.some((stem) => title.includes(stem));
    });
    if (recipe) return { item: candidate, recipe };
  }
  return { item: items[0], recipe: null };
}
