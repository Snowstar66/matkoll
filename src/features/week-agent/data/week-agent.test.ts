import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { finishDraftIn, readDraftIn, readSettingsIn, saveDraftIn, saveSettingsIn, updateDraftIn, WeekAgentDataError } = await import("./week-agent");
const { input, library } = await import("../domain/fixtures");
const { planDeterministic } = await import("../domain/plan");
const { defaultWeekAgentSettings } = await import("../domain/settings");

type Step = { data?: unknown; error?: { code: string } | null };

/** A chainable fake of the Supabase query builder: records each call, answers from a queue of results. */
function fakeDb(...steps: Step[]) {
  const calls: { table: string; ops: [string, unknown[]][] }[] = [];
  const queue = [...steps];
  const db = {
    from(table: string) {
      const call = { table, ops: [] as [string, unknown[]][] };
      calls.push(call);
      const result = () => {
        const step = queue.shift() ?? { data: null };
        return { data: step.data ?? null, error: step.error ?? null };
      };
      const chain: Record<string, unknown> = {};
      for (const name of ["select", "update", "insert", "eq", "not"]) {
        chain[name] = (...args: unknown[]) => {
          call.ops.push([name, args]);
          return chain;
        };
      }
      chain.maybeSingle = () => Promise.resolve(result());
      chain.single = () => Promise.resolve(result());
      chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve);
      return chain;
    },
  };
  return { db: db as never, calls };
}

const proposal = (() => {
  const result = planDeterministic(input(library()));
  if (result.status !== "ok") throw new Error("ok expected");
  return result.proposal;
})();

describe("settings", () => {
  it("reads the defaults when the household has no row, and a stored row with fallbacks", async () => {
    expect(await readSettingsIn(fakeDb({ data: null }).db)).toEqual(defaultWeekAgentSettings);
    expect(await readSettingsIn(fakeDb({ data: { settings: { dinners: 4, budget: "bogus" } } }).db)).toMatchObject({ dinners: 4, budget: "normal" });
  });

  it("throws a coded error that carries no data", async () => {
    await expect(readSettingsIn(fakeDb({ error: { code: "42501" } }).db)).rejects.toMatchObject({ name: "WeekAgentDataError", detail: "settings_read_failed 42501" });
  });

  it("updates the row when there is one, otherwise inserts it", async () => {
    const first = fakeDb({ data: [{ id: "a" }] });
    await saveSettingsIn(first.db, defaultWeekAgentSettings);
    expect(first.calls).toHaveLength(1);
    const second = fakeDb({ data: [] }, { data: null });
    await saveSettingsIn(second.db, { ...defaultWeekAgentSettings, dinners: 4 });
    expect(second.calls.map((c) => c.ops[0][0])).toEqual(["update", "insert"]);
    expect(second.calls[1].ops[0][1][0]).toEqual({ settings: { ...defaultWeekAgentSettings, dinners: 4 } });
  });

  it("retries once when two phones insert at the same time, and refuses invalid settings", async () => {
    const race = fakeDb({ data: [] }, { error: { code: "23505" } }, { data: [{ id: "a" }] });
    await saveSettingsIn(race.db, defaultWeekAgentSettings);
    expect(race.calls).toHaveLength(3);
    await expect(saveSettingsIn(fakeDb().db, { ...defaultWeekAgentSettings, dinners: 12 })).rejects.toThrow();
    await expect(saveSettingsIn(fakeDb({ data: [] }, { error: { code: "XX000" } }).db, defaultWeekAgentSettings)).rejects.toBeInstanceOf(WeekAgentDataError);
  });
});

describe("drafts", () => {
  it("reads a valid draft and ignores a stored shape it does not know", async () => {
    const row = { id: "d1", week_start: "2026-11-16", status: "draft", proposal, model: "haiku", created_at: "2026-11-15T10:00:00Z" };
    expect(await readDraftIn(fakeDb({ data: row }).db, "2026-11-16")).toEqual({ id: "d1", weekStart: "2026-11-16", status: "draft", proposal, model: "haiku", createdAt: "2026-11-15T10:00:00Z" });
    expect(await readDraftIn(fakeDb({ data: { ...row, proposal: { days: [] } } }).db, "2026-11-16")).toBeNull();
    expect(await readDraftIn(fakeDb({ data: null }).db, "2026-11-16")).toBeNull();
  });

  it("discards the week's earlier draft before it saves a new one", async () => {
    const { db, calls } = fakeDb({ data: null }, { data: { id: "new" } });
    expect(await saveDraftIn(db, "2026-11-16", proposal, "haiku")).toBe("new");
    expect(calls.map((c) => c.ops[0][0])).toEqual(["update", "insert"]);
    expect(calls[0].ops[0][1][0]).toEqual({ status: "discarded" });
    expect(calls[1].ops[0][1][0]).toMatchObject({ week_start: "2026-11-16", status: "draft", model: "haiku" });
  });

  it("will not save a proposal that is not seven days", async () => {
    await expect(saveDraftIn(fakeDb().db, "2026-11-16", { ...proposal, days: proposal.days.slice(0, 3) }, "rules")).rejects.toThrow();
  });

  it("only changes or finishes a row that is still a draft", async () => {
    const ok = fakeDb({ data: [{ id: "d1" }] });
    expect(await updateDraftIn(ok.db, "d1", proposal, "sonnet")).toBe(true);
    expect(ok.calls[0].ops.map(([name, args]) => (name === "eq" ? args : name))).toEqual(["update", ["id", "d1"], ["status", "draft"], "select"]);
    expect(await finishDraftIn(fakeDb({ data: [] }).db, "d1", "used")).toBe(false);
    expect(await finishDraftIn(fakeDb({ data: [{ id: "d1" }] }).db, "d1", "discarded")).toBe(true);
    await expect(finishDraftIn(fakeDb({ error: { code: "42501" } }).db, "d1", "used")).rejects.toMatchObject({ detail: "draft_finish_failed 42501" });
  });
});
