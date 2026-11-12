import type { FitPerson } from "@/features/menu-advisor";
import type { OfferTagData } from "@/lib/offer-tag";
import type { WeekAgentSettings } from "./settings";

// The contract of Veckoagenten (PR 1). Pure types: the shortlist the model is given, what the planner needs, the
// proposal that is shown and saved, and what a run ends in. A day is `dayIndex` 1 (måndag) to 7 (söndag), the same
// number as meal_plan_recipe.weekday, so a proposal day maps straight onto Matsedel.

/** An offer on one of the ingredients of a recipe, with the store it is at ("Extrapris på Laxfilé hos ICA"). */
export type OfferHit = OfferTagData & { store: string | null; storeId?: string | null };

/** Something at home that goes out soon and that the recipe uses. `expiresWeekday` is the day of THIS week (1-7), null when it is not in this week (already old, or no date). */
export type UseSoonItem = {
  name: string;
  expiresWeekday: number | null;
  /** True when the day is the app's own estimate (added + the days the ingredient keeps), not a date from a package. Pantry items always are. */
  estimated?: boolean;
  /** The last day is today (and today is in the week). */
  today?: boolean;
};

export type CostLevel = "low" | "normal" | "high";

/** One library recipe with the facts the agent needs, read by the route layer (offers, pantry) and given in. */
export type RecipeCandidate = {
  id: string;
  title: string;
  /** The ingredient lines as written ("2 dl grädde"): allergies, tastes and vegetarian are read from them. */
  ingredients: readonly string[];
  totalMinutes: number | null;
  /** When the caller knows (a tag, a catalog flag); otherwise the ingredient words decide. */
  vegetarian?: boolean;
  costLevel?: CostLevel;
  /** This week's offers on main ingredients of the recipe, the stores the household follows. */
  offers?: readonly OfferHit[];
  /** What is at home and goes out soon that the recipe uses. */
  useSoon?: readonly UseSoonItem[];
};

/** A day the household already fixed (a dish in Matsedel); it stays as it is. It may not be a library recipe candidate. */
export type FixedDay = {
  dayIndex: number;
  recipeId: string | null;
  title: string;
  ingredients: readonly string[];
  /** `fixed` (default) for a dish the household put there; `proposed` for a proposed day the user locked, which a re-roll keeps and still calls proposed. */
  source?: "fixed" | "proposed";
  /** meal_plan_recipe.source of the row: null/"user" is the household's own choice, "week_agent" a dish an earlier "Använd veckan" put there. Every existing row is a fixed day whatever this says; it only changes the reason text. */
  placedBy?: PlacedBy | null;
};

/** meal_plan_recipe.source: who put a dish on its day (null in the database means the user). */
export type PlacedBy = "user" | "week_agent";

/** A recipe that was cooked or planned in an earlier week: 1 is last week. */
export type RecentRecipe = { recipeId: string; weeksAgo: number };

/** Everything the planner (and the validator) needs, with the candidates already shortlisted. */
export type PlanInput = {
  /** The Monday of the week, YYYY-MM-DD. */
  weekStart: string;
  settings: WeekAgentSettings;
  /** The ranked shortlist, best first (buildShortlist). Only these may be proposed. */
  candidates: readonly RecipeCandidate[];
  /** Days that already have a dish. Locked. */
  fixedDays: readonly FixedDay[];
  /** The household's people with allergies, tastes (names are for the household's eyes only, never sent to the model). */
  people: readonly FitPerson[];
  recent: readonly RecentRecipe[];
  /** Days of the week that are already over (before today, Stockholm): never planned, as the week agent fills what is left. */
  pastDays?: readonly number[];
};

/** The pool a shortlist is made from: everything but the shortlist itself. */
export type ShortlistContext = Omit<PlanInput, "candidates">;

export type ExcludedDish = { recipeId: string; title: string; allergens: string[] };

/** What a day is: a dinner (fixed or proposed), a day with leftovers, or a day with no dinner (skipped, or past the number of dinners). */
export type DaySlot = "dinner" | "leftover" | "skip";

export type UseSoonTag = UseSoonItem;

export type ProposalDay = {
  dayIndex: number;
  slot: DaySlot;
  recipeId: string | null;
  title: string | null;
  source: "fixed" | "proposed";
  /** A fixed day is locked; so can a proposed day be, by the user ("Gör om" leaves it). */
  locked: boolean;
  /** Why, short sentences built from facts ("Extrapris på Laxfilé hos ICA", "Går ut fredag"). */
  reasons: string[];
  offerTags: OfferHit[];
  useSoonTags: UseSoonTag[];
  /** "Kan innehålla laktos (Anna)": set on a fixed dish that holds an allergen (the user's own choice; never on a proposed one). */
  allergyWarning: string | null;
};

export type WeekProposal = {
  weekStart: string;
  /** Always seven days, 1-7. */
  days: ProposalDay[];
};

export type ViolationCode =
  | "unknown_recipe"
  | "allergen_dish"
  | "duplicate_recipe"
  | "fixed_day_touched"
  | "day_not_open"
  | "vegetarian_day_meat"
  | "wrong_dinner_count"
  | "same_kind_adjacent"
  | "slow_weekday"
  | "recent_repeat";

/** `hard` means the answer cannot be used as it is (the model gets another try, Haiku then Sonnet); `soft` is only worth a mention. */
export type Violation = {
  code: ViolationCode;
  severity: "hard" | "soft";
  dayIndex?: number;
  recipeId?: string;
  message: string;
};

/** One dish for one day, from the model or the fallback. */
export type DayPick = { dayIndex: number; recipeId: string };

export type PlanResult =
  | {
      status: "ok";
      proposal: WeekProposal;
      /** Recipes left out because they may hold an allergen of the household, by name. */
      excludedForAllergy: ExcludedDish[];
      /** Everything found wrong with the picks that were given (invalid ones were dropped); soft ones included. */
      violations: Violation[];
    }
  | {
      /** The shortlist cannot fill the open days (after the hard rules): nothing is proposed. */
      status: "too_few_recipes";
      needed: number;
      available: number;
      excludedForAllergy: ExcludedDish[];
    }
  | {
      /** The household's daily AI limit is reached; made by the server layer, not the pure planner. */
      status: "cap_reached";
    };
