import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { SettingsDataError } from "../data/client";
import type { Store } from "../domain/store";

// saveStore with the user check, the session client, the write and revalidation stubbed.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const saveStoreIn = vi.fn();
vi.mock("../data/stores", () => ({ saveStoreIn: (...args: unknown[]) => saveStoreIn(...args) }));

const { saveStore } = await import("./save-store");

const id = "11111111-1111-4111-8111-111111111111";
const willys: Store = {
  id,
  name: "Willys Lindhagen",
  chain: "Willys",
  externalStoreId: null,
  address: null,
  url: null,
  offersUrl: null,
  isSelected: true,
};

function form(fields: Record<string, string> = {}) {
  const data = new FormData();
  for (const [name, value] of Object.entries({ id, mode: "add", name: "Willys Lindhagen", chain: "Willys", makeSelected: "true", ...fields })) {
    data.set(name, value);
  }
  return data;
}

beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  saveStoreIn.mockReset().mockResolvedValue({ kind: "saved", store: willys });
  revalidateFor.mockReset();
});

describe("saveStore", () => {
  it("saves the store as the schema gives it, selected, and revalidates the store's routes", async () => {
    expect(await saveStore(null, form({ externalStoreId: " ", address: " Lindhagensgatan 1 " }))).toEqual(ok({ store: willys }));
    expect(saveStoreIn).toHaveBeenCalledWith(db, {
      id,
      mode: "add",
      name: "Willys Lindhagen",
      chain: "Willys",
      externalStoreId: null,
      address: "Lindhagensgatan 1",
      url: null,
      // Willys has no offer site: the store has no link to weekly offers.
      offersUrl: null,
      makeSelected: true,
    });
    expect(revalidateFor).toHaveBeenCalledWith("store");
  });

  it("saves the link to the weekly offers of an ICA store, with its trailing slash (Story 9.1)", async () => {
    await saveStore(null, form({ chain: "ICA", offersUrl: " https://www.ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733 " }));
    expect(saveStoreIn.mock.calls[0][1]).toMatchObject({
      chain: "ICA",
      offersUrl: "https://www.ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733/",
    });
  });

  it("keeps the stored link when the form has no such field, and removes it when it is emptied", async () => {
    await saveStore(null, form({ chain: "ICA" }));
    expect(saveStoreIn.mock.calls[0][1].offersUrl).toBeUndefined();
    await saveStore(null, form({ chain: "ICA", offersUrl: "  " }));
    expect(saveStoreIn.mock.calls[1][1].offersUrl).toBeNull();
  });

  it.each([
    "https://www.willys.se/erbjudanden/butik",
    "https://www.ica.se/recept/kladdkaka-123/",
    "https://www.ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733/?utm=x",
    "https://www.ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733/#top",
  ])("refuses %s as the offers link, and saves nothing", async (offersUrl) => {
    expect(await saveStore(null, form({ chain: "ICA", offersUrl }))).toEqual(
      fail("validation", {
        offersUrl:
          "Ange adressen till butikens erbjudanden på ica.se, till exempel https://www.ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733/.",
      }),
    );
    expect(saveStoreIn).not.toHaveBeenCalled();
  });

  it("does not select the store without the ticked box", async () => {
    const data = form();
    data.delete("makeSelected");
    await saveStore(null, data);
    expect(saveStoreIn.mock.calls[0][1]).toMatchObject({ makeSelected: false });
  });

  it("returns unauthorized without an allowed user, and saves nothing", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await saveStore(null, form())).toEqual(fail("unauthorized"));
    expect(saveStoreIn).not.toHaveBeenCalled();
  });

  it("gives the messages by field and saves nothing", async () => {
    expect(await saveStore(null, form({ name: "  ", url: "http://willys.se" }))).toEqual(
      fail("validation", { name: "Ange butikens namn.", url: "Ange en adress som börjar med https://." }),
    );
    expect(await saveStore(null, form({ address: "a".repeat(201) }))).toEqual(
      fail("validation", { address: "Texten får vara högst 200 tecken." }),
    );
    expect(saveStoreIn).not.toHaveBeenCalled();
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("refuses a chain outside STORE_CHAINS or an id that is not one", async () => {
    expect(await saveStore(null, form({ chain: "Konsum" }))).toEqual(fail("validation", {}));
    expect(await saveStore(null, form({ id: "1" }))).toEqual(fail("validation", {}));
    expect(await saveStore(null, form({ mode: "upsert" }))).toEqual(fail("validation", {}));
    expect(saveStoreIn).not.toHaveBeenCalled();
  });

  it("names the duplicate at Butiks-id", async () => {
    saveStoreIn.mockResolvedValue({ kind: "duplicate" });
    expect(await saveStore(null, form())).toEqual(
      fail("settings_duplicate_store", { externalStoreId: "Butiken finns redan." }),
    );
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("says when the store is gone", async () => {
    saveStoreIn.mockResolvedValue({ kind: "gone" });
    expect(await saveStore(null, form())).toEqual(fail("settings_store_gone"));
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("adds a new store whose id another user has taken once more, with a new id", async () => {
    saveStoreIn.mockResolvedValueOnce({ kind: "id_taken" });
    expect(await saveStore(null, form())).toEqual(ok({ store: willys }));
    expect(saveStoreIn).toHaveBeenCalledTimes(2);
    const retried = saveStoreIn.mock.calls[1][1] as { id: string };
    expect(retried.id).not.toBe(id);
    expect(retried.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(revalidateFor).toHaveBeenCalledWith("store");
  });

  it.each([
    ["a change", "change", 1],
    ["an add whose new id is taken too", "add", 2],
  ])("gives settings_save_failed for %s with a taken id", async (_, mode, calls) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    saveStoreIn.mockResolvedValue({ kind: "id_taken" });
    expect(await saveStore(null, form({ mode }))).toEqual(fail("settings_save_failed"));
    expect(saveStoreIn).toHaveBeenCalledTimes(calls);
    expect(log).toHaveBeenCalledWith("settings_save_failed", { reason: "id_taken" });
    expect(revalidateFor).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("gives settings_save_failed when the write fails, and logs only the reason", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    saveStoreIn.mockRejectedValue(new SettingsDataError("save_store 23505"));
    expect(await saveStore(null, form())).toEqual(fail("settings_save_failed"));
    expect(log).toHaveBeenCalledWith("settings_save_failed", { reason: "save_store 23505" });
    log.mockRestore();
  });

  it("throws other errors, which are bugs", async () => {
    saveStoreIn.mockRejectedValue(new TypeError("boom"));
    await expect(saveStore(null, form())).rejects.toThrow("boom");
  });
});
