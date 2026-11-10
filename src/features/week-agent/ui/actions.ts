import type {
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
} from "../actions/contract";
import type { WeekAgentSettings } from "../domain/settings";

// What the screens call. The route layer passes the real server actions; the tests pass a fake. Every call returns
// a discriminated union; a call that throws (the network is gone) is caught by the screen and shown as an error.

export type WeekAgentActions = {
  propose: (input: ProposeWeekInput) => Promise<ProposeWeekResult>;
  alternatives: (input: AlternativesInput) => Promise<AlternativesResult>;
  swap: (input: SwapDayInput) => Promise<DraftResult>;
  setLock: (input: SetDayLockInput) => Promise<DraftResult>;
  apply: (input: ApplyWeekInput) => Promise<ApplyWeekResult>;
  discard: (input: DiscardDraftInput) => Promise<OkOrError>;
  /** Deletes the rows `apply` wrote. Left out when the backend has no such action: "Använd veckan" then has no Ångra. */
  undo?: (input: { draftId: string }) => Promise<OkOrError>;
};

/** A store the household follows, for "Butiker för erbjudanden". */
export type StoreChoice = { id: string; name: string };

/** What the settings sheet shows and saves. */
export type SettingsContext = { settings: WeekAgentSettings; stores: StoreChoice[] };

export type SettingsActions = {
  /** The household's settings and followed stores; `null` when they cannot be read. */
  load: () => Promise<SettingsContext | null>;
  save: (settings: WeekAgentSettings) => Promise<OkOrError>;
};

/** What a proposal costs, worded by the route layer from the app's price table (ai-choice.ts): "ca 0,01 kr". */
export type CostTexts = { standard: string; careful: string };
