import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { PantryDataError } from "../data/client";
import { emptySiteNameText, siteNameTakenText, siteNameTooLongText } from "../domain/site";

// selectPantrySite, savePantrySite and deletePantrySite (Story 8.2) with the
// user check, the session client, the data functions and revalidation stubbed.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const saveSiteIn = vi.fn();
const selectSiteIn = vi.fn();
const deleteSiteIn = vi.fn();
vi.mock("../data/sites", () => ({
  saveSiteIn: (...args: unknown[]) => saveSiteIn(...args),
  selectSiteIn: (...args: unknown[]) => selectSiteIn(...args),
  deleteSiteIn: (...args: unknown[]) => deleteSiteIn(...args),
}));

const steps: string[] = [];
const loadSitePhotoPathsIn = vi.fn();
const removePlacePhotoFiles = vi.fn();
vi.mock("../data/photos", () => ({
  loadSitePhotoPathsIn: (...args: unknown[]) => (steps.push("paths"), loadSitePhotoPathsIn(...args)),
  removePlacePhotoFiles: (...args: unknown[]) => (steps.push("remove"), removePlacePhotoFiles(...args)),
}));

const { selectPantrySite } = await import("./select-pantry-site");
const { savePantrySite } = await import("./save-pantry-site");
const { deletePantrySite } = await import("./delete-pantry-site");

const stugan = "44444444-4444-4444-8444-444444444444";
const site = { id: stugan, name: "Stugan", isSelected: false };

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  saveSiteIn.mockReset().mockResolvedValue({ kind: "saved", site });
  selectSiteIn.mockReset().mockResolvedValue({ kind: "selected", site: { ...site, isSelected: true } });
  deleteSiteIn.mockReset().mockImplementation(async () => (steps.push("delete"), { kind: "deleted", removed: true }));
  steps.length = 0;
  loadSitePhotoPathsIn.mockReset().mockResolvedValue([]);
  removePlacePhotoFiles.mockReset().mockImplementation(async (_db: unknown, paths: string[]) => paths.length);
  revalidateFor.mockReset();
  log?.mockRestore();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("selectPantrySite", () => {
  it("selects the place, gives its id and name and revalidates everything counted against the pantry", async () => {
    expect(await selectPantrySite({ id: stugan })).toEqual(ok({ site: { id: stugan, name: "Stugan" } }));
    expect(selectSiteIn).toHaveBeenCalledWith(db, stugan);
    expect(revalidateFor).toHaveBeenCalledWith("pantry_site");
  });

  it("gives pantry_site_gone for a place the user does not have, and still revalidates", async () => {
    selectSiteIn.mockResolvedValue({ kind: "gone" });
    expect(await selectPantrySite({ id: stugan })).toEqual(fail("pantry_site_gone"));
    expect(revalidateFor).toHaveBeenCalledWith("pantry_site");
  });

  it("gives pantry_site_failed when the database fails, logging only the codes", async () => {
    selectSiteIn.mockRejectedValue(new PantryDataError("failed 40001"));
    expect(await selectPantrySite({ id: stugan })).toEqual(fail("pantry_site_failed"));
    expect(log).toHaveBeenCalledWith("pantry_site_failed", { reason: "failed 40001" });
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("refuses an id that is not one, and an unknown user, without selecting", async () => {
    expect(await selectPantrySite({ id: "Stugan" })).toEqual(fail("validation"));
    // Every site id is checked as a uuid (z.uuid), as the reads do.
    expect(await selectPantrySite({ id: "11111111-1111-1111-1111-111111111111" })).toEqual(fail("validation"));
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await selectPantrySite({ id: stugan })).toEqual(fail("unauthorized"));
    expect(selectSiteIn).not.toHaveBeenCalled();
  });

  it("throws other errors, which are bugs", async () => {
    selectSiteIn.mockRejectedValue(new TypeError("boom"));
    await expect(selectPantrySite({ id: stugan })).rejects.toThrow("boom");
  });
});

describe("savePantrySite", () => {
  it("adds the place with the client's id, the name made one line and its normalized form", async () => {
    const result = await savePantrySite(null, formData({ id: stugan, name: "  Stugan ", mode: "add" }));
    expect(result).toEqual(ok({ site, mode: "add" }));
    expect(saveSiteIn).toHaveBeenCalledWith(db, { id: stugan, name: "Stugan", normalizedName: "stugan", mode: "add" });
    expect(revalidateFor).toHaveBeenCalledWith("pantry_site");
  });

  it("renames a place", async () => {
    saveSiteIn.mockResolvedValue({ kind: "saved", site: { ...site, name: "Vinterstugan" } });
    const result = await savePantrySite(null, formData({ id: stugan, name: "Vinterstugan", mode: "rename" }));
    expect(result).toEqual(ok({ site: { ...site, name: "Vinterstugan" }, mode: "rename" }));
  });

  it.each([
    ["", emptySiteNameText],
    ["   ", emptySiteNameText],
    ["\u200b\u2066", emptySiteNameText],
    ["a".repeat(41), siteNameTooLongText],
  ])("refuses the name %j with the field's message, and saves nothing", async (name, message) => {
    expect(await savePantrySite(null, formData({ id: stugan, name, mode: "add" }))).toEqual(
      fail("validation", { name: message }),
    );
    expect(saveSiteIn).not.toHaveBeenCalled();
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("refuses a missing id or an unknown mode without a field", async () => {
    expect(await savePantrySite(null, formData({ name: "Stugan", mode: "add" }))).toEqual(fail("validation"));
    expect(await savePantrySite(null, formData({ id: stugan, name: "Stugan", mode: "change" }))).toEqual(fail("validation"));
    expect(saveSiteIn).not.toHaveBeenCalled();
  });

  it("gives pantry_site_name_taken at the field, with the name of the place that has it", async () => {
    saveSiteIn.mockResolvedValue({ kind: "name_taken", name: "Stugan" });
    expect(await savePantrySite(null, formData({ id: stugan, name: " STUGAN ", mode: "add" }))).toEqual(
      fail("pantry_site_name_taken", { name: siteNameTakenText("Stugan") }),
    );
    // The sheet may show stale places: they are read again.
    expect(revalidateFor).toHaveBeenCalledWith("pantry_site");
  });

  it("gives pantry_site_limit at the field", async () => {
    saveSiteIn.mockResolvedValue({ kind: "limit" });
    expect(await savePantrySite(null, formData({ id: stugan, name: "Elfte", mode: "add" }))).toEqual(
      fail("pantry_site_limit", { name: "Du kan ha högst 10 ställen." }),
    );
    expect(revalidateFor).toHaveBeenCalledWith("pantry_site");
  });

  it("gives pantry_site_failed, never ok, for a retried add whose place was renamed since", async () => {
    saveSiteIn.mockResolvedValue({ kind: "stale" });
    expect(await savePantrySite(null, formData({ id: stugan, name: "Stugan", mode: "add" }))).toEqual(
      fail("pantry_site_failed"),
    );
    expect(log).toHaveBeenCalledWith("pantry_site_failed", { reason: "stale_retry" });
    expect(revalidateFor).toHaveBeenCalledWith("pantry_site");
  });

  it("refuses a name that only looks empty, with the empty-name message", async () => {
    for (const name of ["\u3164", "\u00ad\u00ad", "\u2800", "\u115f\u1160"]) {
      expect(await savePantrySite(null, formData({ id: stugan, name, mode: "add" }))).toEqual(
        fail("validation", { name: emptySiteNameText }),
      );
    }
    expect(saveSiteIn).not.toHaveBeenCalled();
  });

  it("gives pantry_site_gone for a rename of a place that is gone, and revalidates", async () => {
    saveSiteIn.mockResolvedValue({ kind: "gone" });
    expect(await savePantrySite(null, formData({ id: stugan, name: "Vinterstugan", mode: "rename" }))).toEqual(
      fail("pantry_site_gone"),
    );
    expect(revalidateFor).toHaveBeenCalledWith("pantry_site");
  });

  it("gives pantry_site_failed when the database fails, logging only the codes and never the name", async () => {
    saveSiteIn.mockRejectedValue(new PantryDataError("failed 23514"));
    expect(await savePantrySite(null, formData({ id: stugan, name: "Hemligt namn", mode: "add" }))).toEqual(
      fail("pantry_site_failed"),
    );
    expect(log).toHaveBeenCalledWith("pantry_site_failed", { reason: "failed 23514" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("Hemligt");
  });

  it("returns unauthorized without an allowed user, and saves nothing", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await savePantrySite(null, formData({ id: stugan, name: "Stugan", mode: "add" }))).toEqual(fail("unauthorized"));
    expect(saveSiteIn).not.toHaveBeenCalled();
  });
});

describe("deletePantrySite", () => {
  it("deletes the place and revalidates", async () => {
    expect(await deletePantrySite({ id: stugan })).toEqual(ok({ removed: true }));
    expect(deleteSiteIn).toHaveBeenCalledWith(db, stugan);
    expect(revalidateFor).toHaveBeenCalledWith("pantry_site");
  });

  it("gives ok for a place that is gone already", async () => {
    deleteSiteIn.mockResolvedValue({ kind: "deleted", removed: false });
    expect(await deletePantrySite({ id: stugan })).toEqual(ok({ removed: false }));
  });

  it("gives pantry_site_in_use for a place with items or selected meanwhile, and revalidates", async () => {
    deleteSiteIn.mockResolvedValue({ kind: "in_use" });
    expect(await deletePantrySite({ id: stugan })).toEqual(fail("pantry_site_in_use"));
    expect(revalidateFor).toHaveBeenCalledWith("pantry_site");
  });

  it("gives pantry_site_failed when the database fails", async () => {
    deleteSiteIn.mockRejectedValue(new PantryDataError("failed 08006"));
    expect(await deletePantrySite({ id: stugan })).toEqual(fail("pantry_site_failed"));
    expect(log).toHaveBeenCalledWith("pantry_site_failed", { reason: "failed 08006" });
  });

  it("refuses an id that is not one, and an unknown user", async () => {
    expect(await deletePantrySite({ id: "x" })).toEqual(fail("validation"));
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await deletePantrySite({ id: stugan })).toEqual(fail("unauthorized"));
    expect(deleteSiteIn).not.toHaveBeenCalled();
    expect(loadSitePhotoPathsIn).not.toHaveBeenCalled();
  });

  describe("the place's photos (Story 10.3)", () => {
    const paths = [`user/${stugan}/kyl/a.jpg`, `user/${stugan}/frys/b.png`];

    it("reads the paths first, deletes the place, then removes the files", async () => {
      loadSitePhotoPathsIn.mockResolvedValue(paths);
      expect(await deletePantrySite({ id: stugan })).toEqual(ok({ removed: true }));
      expect(steps).toEqual(["paths", "delete", "remove"]);
      expect(loadSitePhotoPathsIn).toHaveBeenCalledWith(db, stugan);
      expect(removePlacePhotoFiles).toHaveBeenCalledWith(db, paths);
    });

    it("keeps the photos of a place in use", async () => {
      loadSitePhotoPathsIn.mockResolvedValue(paths);
      deleteSiteIn.mockResolvedValue({ kind: "in_use" });
      expect(await deletePantrySite({ id: stugan })).toEqual(fail("pantry_site_in_use"));
      expect(removePlacePhotoFiles).not.toHaveBeenCalled();
    });

    it("keeps the photos when the place cannot be deleted", async () => {
      loadSitePhotoPathsIn.mockResolvedValue(paths);
      deleteSiteIn.mockRejectedValue(new PantryDataError("failed 08006"));
      expect(await deletePantrySite({ id: stugan })).toEqual(fail("pantry_site_failed"));
      expect(removePlacePhotoFiles).not.toHaveBeenCalled();
    });

    it("still deletes the place when the files cannot be removed, logging only the reason", async () => {
      loadSitePhotoPathsIn.mockResolvedValue(paths);
      removePlacePhotoFiles.mockRejectedValue(new PantryDataError("remove_failed 503"));
      expect(await deletePantrySite({ id: stugan })).toEqual(ok({ removed: true }));
      expect(log).toHaveBeenCalledWith("pantry_photo_remove_failed", { reason: "remove_failed 503" });
      expect(JSON.stringify(log.mock.calls)).not.toContain(stugan);
    });

    it("still deletes the place when the paths cannot be read, logging only the reason", async () => {
      loadSitePhotoPathsIn.mockRejectedValue(new PantryDataError("query_failed 08006"));
      expect(await deletePantrySite({ id: stugan })).toEqual(ok({ removed: true }));
      expect(deleteSiteIn).toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith("pantry_photo_remove_failed", { reason: "query_failed 08006" });
      expect(removePlacePhotoFiles).toHaveBeenCalledWith(db, []);
    });
  });
});
