// Ten realistic Swedish recipes (and one that must stay unsure) for the nutrition coverage tests. The lines are
// the way the importer writes them: amount, unit (burk, paket and flaska are "förp") and the catalog name.

export type L = readonly [amount: number | null, unit: string | null, name: string];
export type Recipe = { title: string; servings: number; lines: readonly L[]; kcal?: readonly [number, number]; unsure?: true };

export const recipes: readonly Recipe[] = [
  {
    title: "Spaghetti med köttfärssås",
    servings: 4,
    kcal: [550, 850],
    lines: [
      [500, "g", "köttfärs"], [1, "st", "gul lök"], [2, "klyfta", "vitlök"], [2, "förp", "krossade tomater"],
      [2, "msk", "tomatpuré"], [400, "g", "spaghetti"], [1, "tsk", "oregano"], [1, "msk", "olivolja"], [1, "dl", "riven parmesan"],
    ],
  },
  {
    title: "Pasta carbonara",
    servings: 4,
    kcal: [450, 900],
    lines: [[400, "g", "spaghetti"], [1, "förp", "bacon"], [3, "st", "äggula"], [1, "dl", "parmesan"], [1, "krm", "svartpeppar"]],
  },
  {
    title: "Caesarsallad med kyckling",
    servings: 4,
    kcal: [400, 800],
    lines: [
      [500, "g", "kycklingfilé"], [2, "st", "romansallad"], [1, "förp", "caesardressing"], [1, "dl", "pankoströbröd"],
      [1, "dl", "riven parmesan"], [2, "msk", "olivolja"],
    ],
  },
  {
    title: "Smash burgers",
    servings: 4,
    kcal: [600, 1100],
    lines: [
      [600, "g", "nötfärs"], [1, "förp", "Brioche burger bun"], [2, "msk", "smör"], [1, "st", "rödlök"], [2, "st", "tomat"],
      [4, "skiva", "cheddar"], [2, "msk", "majonnäs"], [1, "msk", "ketchup"], [1, "tsk", "tryffelolja"],
    ],
  },
  {
    title: "Tomatsoppa med basilika",
    servings: 4,
    kcal: [100, 300],
    lines: [
      [2, "förp", "krossade tomater"], [1, "st", "gul lök"], [2, "klyfta", "vitlök"], [5, "dl", "grönsaksbuljong"],
      [1, "dl", "matlagningsgrädde"], [0.5, "kruka", "färsk basilika"], [1, "msk", "olivolja"],
    ],
  },
  {
    title: "Kokoscurry med kikärtor",
    servings: 4,
    kcal: [450, 900],
    lines: [
      [2, "förp", "kikärtor"], [1, "förp", "kokosmjölk"], [2, "msk", "röd currypasta"], [1, "st", "gul lök"], [2, "klyfta", "vitlök"],
      [3, "dl", "jasminris"], [1, "förp", "färsk spenat"], [1, "st", "lime"],
    ],
  },
  {
    title: "Krämig kycklingpasta med chipotle",
    servings: 4,
    kcal: [550, 950],
    lines: [
      [400, "g", "pasta"], [500, "g", "kycklingfilé"], [2, "msk", "chipotlepasta"], [2, "dl", "matlagningsgrädde"],
      [1, "st", "gul lök"], [1, "st", "färsk grön jalapeño"], [1, "dl", "riven ost"],
    ],
  },
  {
    title: "Spagettipumpa med pesto",
    servings: 4,
    kcal: [200, 600],
    lines: [[1, "st", "spagettipumpa"], [1, "förp", "pesto"], [1, "dl", "parmesan"], [2, "msk", "olivolja"], [200, "g", "körsbärstomater"]],
  },
  {
    title: "Tacos",
    servings: 4,
    kcal: [550, 1000],
    lines: [
      [500, "g", "nötfärs"], [1, "förp", "tortilla"], [2, "st", "tomat"], [1, "st", "gurka"], [2, "dl", "gräddfil"],
      [1, "förp", "majs"], [1, "förp", "riven ost"], [1, "msk", "tacokrydda"],
    ],
  },
  {
    title: "Pizza på färdig deg",
    servings: 3,
    kcal: [450, 1100],
    lines: [
      [1, "förp", "färdig pizzadeg"], [1, "förp", "passerade tomater"], [2, "förp", "mozzarella"], [1, "förp", "skinka"],
      [1, "kruka", "basilika"], [1, "msk", "olivolja"],
    ],
  },
  {
    // What stays unsure on purpose: three lines that are in no catalog, so the numbers would be a guess.
    title: "Dal på röda linser",
    servings: 4,
    unsure: true,
    lines: [[3, "dl", ""], [1, "st", ""], [2, "msk", ""], [1, "st", "gul lök"], [2, "klyfta", "vitlök"]],
  },
];
