import { vi } from "vitest";
import type { ApplyWeekResult, ProposeWeekResult } from "../actions/contract";
import { defaultWeekAgentSettings, type WeekAgentSettings } from "../domain/settings";
import type { ProposalDay, WeekProposal } from "../domain/types";
import type { SettingsActions, SettingsContext, WeekAgentActions } from "./actions";

// A typed in-memory fake of the backend's actions, for the screens' tests (not exported from index). Each call is a
// vi.fn, so a test can read what was sent and replace the answer for one case.

export const weekStart = "2026-11-16";
export const rid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const draftId = "00000000-0000-4000-8000-0000000000d1";

const empty = (dayIndex: number): ProposalDay => ({ dayIndex, slot: "dinner", recipeId: null, title: null, source: "proposed", locked: false, reasons: [], offerTags: [], useSoonTags: [], allergyWarning: null });

export function day(dayIndex: number, title: string, extra: Partial<ProposalDay> = {}): ProposalDay {
  return { ...empty(dayIndex), recipeId: rid(dayIndex), title, reasons: [`Skäl för ${title}.`], ...extra };
}

/** Five proposed dinners Mon-Fri, Sat and Sun skipped. */
export function proposal(overrides: Record<number, Partial<ProposalDay>> = {}): WeekProposal {
  const titles = ["Pasta med köttfärssås", "Ugnsbakad lax med potatis", "Linssoppa med bröd", "Kycklingwok med ris", "Tacos"];
  const days: ProposalDay[] = [1, 2, 3, 4, 5, 6, 7].map((index) =>
    index <= 5 ? day(index, titles[index - 1] ?? "", overrides[index]) : { ...empty(index), slot: "skip" as const, ...overrides[index] },
  );
  return { weekStart, days };
}

/** Thursday is the household's own (Pannkakor, with a lactose allergy), the rest is proposed. */
export function proposalAroundFixed(): WeekProposal {
  return proposal({ 4: { title: "Pannkakor", source: "fixed", locked: true, reasons: ["Din rätt. Vi planerar runt den."], allergyWarning: "Kan innehålla laktos (Anna)" } });
}

export const okResult = (p: WeekProposal = proposal(), extra: Partial<Extract<ProposeWeekResult, { status: "ok" }>> = {}): ProposeWeekResult => ({
  status: "ok",
  draftId,
  proposal: p,
  excludedForAllergy: [],
  model: "haiku-5.5",
  ...extra,
});


export function fakeActions(overrides: Partial<WeekAgentActions> = {}, withUndo = true): WeekAgentActions & { propose: ReturnType<typeof vi.fn>; apply: ReturnType<typeof vi.fn>; swap: ReturnType<typeof vi.fn>; setLock: ReturnType<typeof vi.fn>; discard: ReturnType<typeof vi.fn>; alternatives: ReturnType<typeof vi.fn>; undo: ReturnType<typeof vi.fn> } {
  const apply: ApplyWeekResult = { status: "ok", written: [1, 2, 3, 4, 5], skippedOccupied: [] };
  return {
    propose: vi.fn(async () => okResult()),
    alternatives: vi.fn(async () => ({ status: "ok" as const, options: [{ recipeId: rid(20), title: "Broccolipasta", reasons: ["Pasta igen, men ni älskar pasta."], allergyWarning: null }, { recipeId: rid(21), title: "Krämig kycklinggryta", reasons: ["Du lagar den ofta."], allergyWarning: "Kan innehålla laktos (Anna)" }] })),
    swap: vi.fn(async () => ({ status: "ok" as const, proposal: proposal({ 2: { title: "Broccolipasta", recipeId: rid(20) } }) })),
    setLock: vi.fn(async () => ({ status: "ok" as const, proposal: proposal({ 2: { locked: true } }) })),
    apply: vi.fn(async () => apply),
    discard: vi.fn(async () => ({ status: "ok" as const })),
    undo: withUndo ? vi.fn(async () => ({ status: "ok" as const })) : (undefined as never),
    ...overrides,
  } as never;
}

export const savedSettings = (extra: Partial<WeekAgentSettings> = {}): WeekAgentSettings => ({ ...defaultWeekAgentSettings, vegetarianDays: [], skipDays: [], leftoverDays: [], offerStoreIds: [], ...extra });

export const stores = [
  { id: "00000000-0000-4000-8000-0000000000a1", name: "ICA Nära Sundbyberg" },
  { id: "00000000-0000-4000-8000-0000000000a2", name: "Willys Solna" },
];

export function fakeSettings(context: SettingsContext | null = { settings: savedSettings(), stores }): SettingsActions & { load: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> } {
  return { load: vi.fn(async () => context), save: vi.fn(async () => ({ status: "ok" as const })) } as never;
}

export const cost = { standard: "ca 0,01 kr", careful: "ca 0,18 kr" };
