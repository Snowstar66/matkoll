import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { SettingsDataError } from "../data/client";

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const saveAiCapIn = vi.fn();
vi.mock("../data/ai-cap", () => ({ saveAiCapIn: (...args: unknown[]) => saveAiCapIn(...args) }));

const { setAiCap } = await import("./set-ai-cap");

beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "owner", email: "owner@example.com" }));
  saveAiCapIn.mockReset().mockResolvedValue(true);
  revalidateFor.mockReset();
});

describe("setAiCap", () => {
  it("saves the cap and revalidates Inställningar", async () => {
    expect(await setAiCap({ capSek: 12.5 })).toEqual(ok(12.5));
    expect(saveAiCapIn).toHaveBeenCalledWith(db, 12.5);
    expect(revalidateFor).toHaveBeenCalledWith("ai_cap");
  });

  it("accepts 0 (AI off for the others) and 1000", async () => {
    expect(await setAiCap({ capSek: 0 })).toEqual(ok(0));
    expect(await setAiCap({ capSek: 1000 })).toEqual(ok(1000));
  });

  it("refuses numbers outside 0 to 1000 and non-numbers without writing", async () => {
    for (const capSek of [-1, 1000.5, Number.NaN, Number.POSITIVE_INFINITY, "10" as never]) {
      expect(await setAiCap({ capSek })).toMatchObject({ ok: false, error: { code: "validation" } });
    }
    expect(saveAiCapIn).not.toHaveBeenCalled();
  });

  it("answers ai_cap_not_owner when the database says the caller is not the owner", async () => {
    saveAiCapIn.mockResolvedValue(false);
    expect(await setAiCap({ capSek: 5 })).toEqual(fail("ai_cap_not_owner"));
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("answers ai_cap_save_failed on a database error, and nothing without a session", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    saveAiCapIn.mockRejectedValue(new SettingsDataError("save_ai_cap_failed XX000"));
    expect(await setAiCap({ capSek: 5 })).toEqual(fail("ai_cap_save_failed"));
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await setAiCap({ capSek: 5 })).toEqual(fail("unauthorized"));
  });
});
