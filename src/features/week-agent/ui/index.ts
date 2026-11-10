// The screens of Veckoagenten (AD-1: the route layer composes them with Matsedel; nothing here imports another feature).
export type { CostTexts, SettingsActions, SettingsContext, StoreChoice, WeekAgentActions } from "./actions";
export { cardState, cardTexts, weekPlanTokens, type CardState } from "./format";
export { ProposalScreen, type ProposalDraft, type ProposalScreenProps } from "./proposal-screen";
export { SettingsSheet, type SettingsSheetProps } from "./settings-sheet";
export { WeekAgentCard, type WeekAgentCardProps } from "./week-card";
export { WeekAgentMenu, type WeekAgentMenuProps } from "./week-menu";
export type {
  AlternativeOption,
  AlternativesInput,
  AlternativesResult,
  ApplyWeekInput,
  ApplyWeekResult,
  DiscardDraftInput,
  DraftResult,
  OkOrError,
  ProposeWeekInput,
  ProposeWeekResult,
  SetDayLockInput,
  SwapDayInput,
  UndoWeekInput,
  UndoWeekResult,
  WeekAgentModel,
} from "../actions/contract";
