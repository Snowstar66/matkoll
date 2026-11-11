// Client-safe entry of Veckoagenten (AD-1). Pure logic only; the model call and the draft storage come in later PRs.
export {
  budgets,
  cookableDays,
  defaultDinners,
  defaultWeekAgentSettings,
  maxDinners,
  minDinners,
  parseWeekAgentSettings,
  resolveDayRoles,
  toStoredSettings,
  weekdaySchema,
  weekAgentSettingsSchema,
  type Budget,
  type WeekAgentSettings,
} from "./domain/settings";
export type {
  CostLevel,
  DaySlot,
  ExcludedDish,
  FixedDay,
  OfferHit,
  PlacedBy,
  DayPick,
  PlanInput,
  PlanResult,
  ProposalDay,
  RecentRecipe,
  RecipeCandidate,
  ShortlistContext,
  UseSoonItem,
  UseSoonTag,
  Violation,
  ViolationCode,
  WeekProposal,
} from "./domain/types";
export { buildShortlist, maxShortlist, quickMinutes, scoreCandidate, type ShortlistResult } from "./domain/shortlist";
export { dayRoles, fallbackPicks, openDays, planAroundFixed, planDeterministic, validatePicks, validatePlan } from "./domain/plan";
export { allergenTerms, allergyWarningText, isVegetarian } from "./domain/facts";
export { offerReason, useSoonReason } from "./domain/reasons";
export { agentSource, applyPlan, lockedDaysOf, rerollableDays, type ApplyPlan } from "./domain/apply";
export { proposalDaySchema, proposalStatuses, weekProposalSchema, type ProposalStatus } from "./domain/proposal";
export { draftFreshness, draftMaxAgeMs, draftToShow, type DraftFreshness } from "./domain/draft-age";
