import type {
  AlternativesInput,
  AlternativesResult,
  ApplyWeekInput,
  ApplyWeekResult,
  CurrentWeekInput,
  CurrentWeekResult,
  DiscardDraftInput,
  DraftResult,
  OkOrError,
  ProposeWeekInput,
  ProposeWeekResult,
  SetDayLockInput,
  SwapDayInput,
  UndoWeekInput,
  UndoWeekResult,
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
  /** Takes back what `apply` did (removes its dishes, puts back what it replaced). Left out: "Använd veckan" then has no Ångra. */
  /** The week's state now, for a screen whose draft is gone (`code: "no_draft"`). Left out: the screen offers a new proposal. */
  current?: (input: CurrentWeekInput) => Promise<CurrentWeekResult>;
  undo?: (input: UndoWeekInput) => Promise<UndoWeekResult>;
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
