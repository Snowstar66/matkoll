import type { FitPerson } from "@/features/menu-advisor";
import { buildShortlist, defaultWeekAgentSettings, type FixedDay, type OfferHit, type PlanInput, type RecentRecipe, type RecipeCandidate, type UseSoonItem, type WeekAgentSettings } from "@/features/week-agent";

// Veckoagenten's planning eval (tests/eval/week-plan.eval.ts): a household library of 32 realistic Swedish dinners and
// six cases around it. The shortlists are built by the app's own buildShortlist, so the model gets what the app gives it.

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Dish = [title: string, minutes: number, ingredients: string[]];
const dishes: Dish[] = [
  ["Pasta med köttfärssås", 35, ["400 g spaghetti", "500 g nötfärs", "1 burk krossade tomater", "1 gul lök", "2 vitlöksklyftor"]],
  ["Kycklinggryta med grädde", 50, ["600 g kycklingfilé", "2 dl matlagningsgrädde", "1 gul lök", "2 dl ris"]],
  ["Ugnsbakad lax med potatis", 40, ["4 laxfilé", "800 g potatis", "1 citron", "1 dl crème fraiche"]],
  ["Röd linssoppa", 25, ["3 dl röda linser", "1 gul lök", "2 morötter", "2 dl kokosmjölk", "1 msk currypasta"]],
  ["Grönsakscurry med kikärtor", 35, ["1 blomkål", "1 burk kikärtor", "2 dl kokosmjölk", "2 dl ris", "1 msk currypasta"]],
  ["Korvstroganoff", 25, ["500 g falukorv", "2 dl matlagningsgrädde", "1 gul lök", "2 dl ris", "2 msk tomatpuré"]],
  ["Pannkakor med sylt", 30, ["3 dl vetemjöl", "6 dl mjölk", "3 ägg", "1 burk jordgubbssylt"]],
  ["Wok med nudlar och tofu", 20, ["200 g nudlar", "200 g tofu", "1 paprika", "2 morötter", "2 msk sojasås"]],
  ["Fiskgratäng med torsk", 45, ["600 g torsk", "3 dl grädde", "100 g ost", "1 dl dill"]],
  ["Svampsoppa med bröd", 30, ["300 g champinjoner", "1 gul lök", "5 dl grönsaksbuljong", "1 dl grädde"]],
  ["Tacos med nötfärs", 25, ["500 g nötfärs", "1 paket tacokrydda", "8 tacoskal", "1 isbergssallad", "1 dl riven ost"]],
  ["Vegetariska tacos med svarta bönor", 25, ["2 burkar svarta bönor", "1 paket tacokrydda", "8 tacoskal", "1 avokado", "1 isbergssallad"]],
  ["Köttbullar med potatismos", 45, ["600 g köttbullar", "1 kg potatis", "2 dl mjölk", "1 dl lingonsylt", "2 dl grädde"]],
  ["Kyckling i ugn med rotsaker", 60, ["8 kycklinglår", "500 g morötter", "500 g palsternacka", "1 gul lök"]],
  ["Lasagne", 70, ["500 g nötfärs", "9 lasagneplattor", "5 dl béchamelsås", "200 g ost", "1 burk krossade tomater"]],
  ["Thaisoppa med räkor", 30, ["300 g räkor", "4 dl kokosmjölk", "1 msk röd currypasta", "200 g risnudlar", "1 lime"]],
  ["Halloumi med ugnsgrönsaker", 40, ["250 g halloumi", "1 zucchini", "1 paprika", "300 g potatis", "1 dl yoghurt"]],
  ["Sojafärsbolognese", 35, ["300 g sojafärs", "400 g pasta", "1 burk krossade tomater", "1 gul lök", "2 vitlöksklyftor"]],
  ["Pytt i panna", 30, ["600 g potatis", "300 g korv", "1 gul lök", "4 ägg", "1 burk rödbetor"]],
  ["Omelett med svamp och ost", 20, ["8 ägg", "200 g champinjoner", "100 g ost", "2 msk smör"]],
  ["Biff med bearnaisesås", 40, ["500 g entrecôte", "800 g potatis", "1 dl bearnaisesås", "200 g haricots verts"]],
  ["Fiskpinnar med potatismos", 25, ["12 fiskpinnar", "800 g potatis", "2 dl mjölk", "1 dl ärtor", "1 citron"]],
  ["Stekt torsk med remouladsås", 35, ["600 g torskfilé", "1 dl remouladsås", "800 g potatis", "1 citron"]],
  ["Spaghetti carbonara", 25, ["400 g spaghetti", "200 g bacon", "4 äggulor", "1 dl riven parmesan"]],
  ["Chili con carne", 50, ["500 g nötfärs", "2 burkar kidneybönor", "1 burk krossade tomater", "2 dl ris", "1 msk chilipulver"]],
  ["Vegetarisk lasagne med spenat", 65, ["500 g spenat", "9 lasagneplattor", "5 dl béchamelsås", "200 g ost", "250 g ricotta"]],
  ["Ärtsoppa och pannkakor", 60, ["5 dl gula ärtor", "300 g fläskkött", "1 gul lök", "3 dl vetemjöl", "6 dl mjölk"]],
  ["Laxpasta", 25, ["400 g pasta", "300 g laxfilé", "2 dl matlagningsgrädde", "1 citron", "1 dl dill"]],
  ["Kikärtsgryta med spenat", 35, ["2 burkar kikärtor", "200 g spenat", "1 burk krossade tomater", "1 gul lök", "2 dl ris"]],
  ["Fläskfilé med couscous", 35, ["600 g fläskfilé", "3 dl couscous", "1 paprika", "1 zucchini"]],
  ["Tomatsoppa med grillad ost", 30, ["2 burkar krossade tomater", "1 gul lök", "4 skivor bröd", "200 g ost"]],
  ["Ugnsstekt korv med rotfrukter", 45, ["500 g grillkorv", "600 g potatis", "300 g morötter", "1 rödlök"]],
];

const library: RecipeCandidate[] = dishes.map(([title, totalMinutes, ingredients], index) => ({ id: uuid(index + 1), title, ingredients, totalMinutes }));
const idOf = (title: string) => library.find((dish) => dish.title === title)?.id ?? "";

const store = "ICA Maxi";
const offer = (name: string, price: string): OfferHit => ({ name, price, store });
const offersFor: Record<string, OfferHit[]> = {
  "Ugnsbakad lax med potatis": [offer("Laxfilé", "129 kr/kg")],
  "Laxpasta": [offer("Laxfilé", "129 kr/kg")],
  "Kycklinggryta med grädde": [offer("Kycklingfilé", "99 kr/kg")],
  "Kyckling i ugn med rotsaker": [offer("Kycklinglår", "39 kr/kg")],
  "Pasta med köttfärssås": [offer("Nötfärs", "69 kr/kg")],
  "Tacos med nötfärs": [offer("Nötfärs", "69 kr/kg")],
  "Lasagne": [offer("Nötfärs", "69 kr/kg")],
  "Röd linssoppa": [offer("Kokosmjölk", "2 för 25 kr")],
  "Thaisoppa med räkor": [offer("Räkor", "89 kr/kg")],
  "Köttbullar med potatismos": [offer("Potatis", "12 kr/kg")],
};
const soonFor: Record<string, UseSoonItem[]> = {
  "Kycklinggryta med grädde": [{ name: "Grädde", expiresWeekday: 3 }],
  "Fiskgratäng med torsk": [{ name: "Grädde", expiresWeekday: 3 }],
  "Svampsoppa med bröd": [{ name: "Champinjoner", expiresWeekday: 2 }],
  "Omelett med svamp och ost": [{ name: "Champinjoner", expiresWeekday: 2 }],
  "Vegetarisk lasagne med spenat": [{ name: "Spenat", expiresWeekday: 4 }],
  "Kikärtsgryta med spenat": [{ name: "Spenat", expiresWeekday: 4 }],
  "Fläskfilé med couscous": [{ name: "Zucchini", expiresWeekday: null }],
  "Halloumi med ugnsgrönsaker": [{ name: "Zucchini", expiresWeekday: null }],
};
/** The library with this case's facts (offers, use-soon) added. */
const pool = (withOffers: boolean, withSoon: boolean): RecipeCandidate[] =>
  library.map((dish) => ({ ...dish, offers: withOffers ? (offersFor[dish.title] ?? []) : [], useSoon: withSoon ? (soonFor[dish.title] ?? []) : [] }));

const anna: FitPerson = { name: "Anna", allergies: ["laktos"], dislikes: ["svamp"], likes: ["pasta", "lax"] };
const bo: FitPerson = { name: "Bo", allergies: [], dislikes: ["lever", "kokos"], likes: ["köttbullar", "tacos"], strongLikes: ["tacos"] };
const maja: FitPerson = { name: "Maja", allergies: [], dislikes: ["paprika"], likes: ["pannkakor", "korv"] };
const olle: FitPerson = { name: "Olle", allergies: [], dislikes: [], likes: ["pasta"] };
const celiac: FitPerson = { name: "Cecilia", allergies: ["gluten"], dislikes: [], likes: ["fisk"] };

const settings = (extra: Partial<WeekAgentSettings> = {}): WeekAgentSettings => ({ ...defaultWeekAgentSettings, vegetarianDays: [], skipDays: [], leftoverDays: [], offerStoreIds: [], ...extra });

const pannkaka = (dayIndex: number): FixedDay => ({ dayIndex, recipeId: idOf("Pannkakor med sylt"), title: "Pannkakor med sylt", ingredients: library.find((d) => d.title === "Pannkakor med sylt")?.ingredients ?? [], source: "fixed", placedBy: "user" });
const fixed = (title: string, dayIndex: number): FixedDay => ({ dayIndex, recipeId: idOf(title), title, ingredients: library.find((d) => d.title === title)?.ingredients ?? [], source: "fixed", placedBy: "user" });

export type EvalCase = { id: string; about: string; input: PlanInput; excludedForAllergy: number };

function makeCase(id: string, about: string, config: { settings: WeekAgentSettings; people: FitPerson[]; fixedDays?: FixedDay[]; recent?: RecentRecipe[]; offers?: boolean; soon?: boolean }): EvalCase {
  const context = { weekStart: "2026-11-16", settings: config.settings, fixedDays: config.fixedDays ?? [], people: config.people, recent: config.recent ?? [] };
  const shortlist = buildShortlist(pool(config.offers ?? true, config.soon ?? true), context);
  return { id, about, input: { ...context, candidates: shortlist.candidates }, excludedForAllergy: shortlist.excludedForAllergy.length };
}

export const cases: EvalCase[] = [
  makeCase("familj-laktos", "Fyra personer, laktosallergi, smaker, 5 middagar, ingenting bestämt", { settings: settings(), people: [anna, bo, maja, olle] }),
  makeCase("pannkaka-torsdag", "Pannkakor bestämda torsdag, resten planeras runt", { settings: settings(), people: [anna, bo, maja, olle], fixedDays: [pannkaka(4)] }),
  makeCase("tre-bestamda", "Tre bestämda dagar (mån, ons, fre), sex middagar", { settings: settings({ dinners: 6 }), people: [anna, bo, maja, olle], fixedDays: [fixed("Tacos med nötfärs", 1), fixed("Köttbullar med potatismos", 3), fixed("Pytt i panna", 5)] }),
  makeCase("vegetarisk-dag", "Två vegetariska dagar, snabba vardagar", { settings: settings({ vegetarianDays: [2, 4], quickWeekdays: true }), people: [anna, bo, maja, olle] }),
  makeCase("lag-budget", "Låg budget, extrapriser och utgångsvaror väger tungt, förra veckans rätter undviks", {
    settings: settings({ budget: "low", dinners: 5 }),
    people: [anna, bo, maja, olle],
    recent: [{ recipeId: idOf("Pasta med köttfärssås"), weeksAgo: 1 }, { recipeId: idOf("Tacos med nötfärs"), weeksAgo: 1 }, { recipeId: idOf("Korvstroganoff"), weeksAgo: 2 }],
  }),
  makeCase("sju-dagar-glutenfri", "Sju middagar minus en hoppa-över-dag och en restdag, gluten- och laktosallergi, en bestämd dag", {
    settings: settings({ dinners: 5, skipDays: [3], leftoverDays: [7] }),
    people: [anna, celiac, bo],
    fixedDays: [fixed("Omelett med svamp och ost", 2)],
  }),
];
