import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorMessages, fail, ok } from "@/lib/errors";
import { SettingsDataError } from "../data/client";

// addRecipeSite with the user check, the session client, the write and revalidation stubbed.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const addRecipeSiteIn = vi.fn();
vi.mock("../data/sites", () => ({ addRecipeSiteIn: (...args: unknown[]) => addRecipeSiteIn(...args) }));

const { addRecipeSite } = await import("./add-recipe-site");

function form(domain?: string | Blob) {
  const data = new FormData();
  if (domain !== undefined) data.set("domain", domain);
  return data;
}

const invalid = fail("settings_invalid_domain", { domain: errorMessages.settings_invalid_domain });

beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  addRecipeSiteIn.mockReset().mockResolvedValue("added");
  revalidateFor.mockReset();
});

describe("addRecipeSite", () => {
  it("normalises the address, adds the site and revalidates Inställningar", async () => {
    expect(await addRecipeSite(null, form("https://www.Arla.se/recept"))).toEqual(ok({ domain: "arla.se" }));
    expect(addRecipeSiteIn).toHaveBeenCalledWith(db, "user", "arla.se");
    expect(revalidateFor).toHaveBeenCalledWith("recipe_site");
  });

  it("counts a site that was turned on again as added", async () => {
    addRecipeSiteIn.mockResolvedValue("reactivated");
    expect(await addRecipeSite(null, form("koket.se"))).toEqual(ok({ domain: "koket.se" }));
    expect(revalidateFor).toHaveBeenCalledWith("recipe_site");
  });

  it("returns unauthorized without an allowed user, and saves nothing", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await addRecipeSite(null, form("arla.se"))).toEqual(fail("unauthorized"));
    expect(addRecipeSiteIn).not.toHaveBeenCalled();
  });

  it.each(["inte en sajt", "localhost", "127.0.0.1", "", "ftp://koket.se"])("refuses %j and saves nothing", async (input) => {
    expect(await addRecipeSite(null, form(input))).toEqual(invalid);
    expect(addRecipeSiteIn).not.toHaveBeenCalled();
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("refuses a missing field or a file", async () => {
    expect(await addRecipeSite(null, form())).toEqual(invalid);
    expect(await addRecipeSite(null, form(new Blob(["koket.se"])))).toEqual(invalid);
    expect(addRecipeSiteIn).not.toHaveBeenCalled();
  });

  it("refuses a domain the table's check refuses", async () => {
    addRecipeSiteIn.mockResolvedValue("invalid");
    expect(await addRecipeSite(null, form("www.www.koket.se"))).toEqual(invalid);
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("names the site that is there already", async () => {
    addRecipeSiteIn.mockResolvedValue("duplicate");
    expect(await addRecipeSite(null, form("https://koket.se/"))).toEqual(
      fail("settings_duplicate_domain", { domain: "koket.se finns redan." }),
    );
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("gives settings_save_failed when the write fails, and logs only the reason", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    addRecipeSiteIn.mockRejectedValue(new SettingsDataError("insert_failed 08006"));
    expect(await addRecipeSite(null, form("arla.se"))).toEqual(fail("settings_save_failed"));
    expect(log).toHaveBeenCalledWith("settings_save_failed", { reason: "insert_failed 08006" });
    log.mockRestore();
  });

  it("throws other errors, which are bugs", async () => {
    addRecipeSiteIn.mockRejectedValue(new TypeError("boom"));
    await expect(addRecipeSite(null, form("arla.se"))).rejects.toThrow("boom");
  });
});
