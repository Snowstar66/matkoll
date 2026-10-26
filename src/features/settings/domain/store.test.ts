import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compareStores,
  newStoreId,
  noAddressText,
  normalizeStoreUrl,
  oneLine,
  readStoreForm,
  selectedStoreText,
  STORE_CHAINS,
  storeChainSchema,
  storeFieldErrors,
  storeFormSchema,
  storeSummaryText,
  type Store,
  type StoreFormInput,
} from "./store";

const id = "11111111-1111-4111-8111-111111111111";

const form = (changes: Partial<StoreFormInput> = {}): StoreFormInput => ({
  id,
  mode: "add",
  name: "Maxi ICA Stormarknad Östersund",
  chain: "ICA",
  externalStoreId: "1003733",
  address: "",
  url: "https://handlaprivatkund.ica.se/stores/1003733",
  makeSelected: false,
  ...changes,
});

function errorsOf(input: StoreFormInput): Record<string, string> {
  const parsed = storeFormSchema.safeParse(input);
  expect(parsed.success).toBe(false);
  return storeFieldErrors(parsed.error!);
}

const store = (changes: Partial<Store>): Store => ({
  id,
  name: "Maxi ICA Stormarknad Östersund",
  chain: "ICA",
  externalStoreId: "1003733",
  address: null,
  url: null,
  isSelected: false,
  ...changes,
});

describe("STORE_CHAINS", () => {
  it("is the fixed list of chains, with Annan last", () => {
    expect(STORE_CHAINS).toEqual(["ICA", "Willys", "Coop", "Lidl", "Hemköp", "City Gross", "Annan"]);
    expect(storeChainSchema.safeParse("ICA Handla").success).toBe(false);
  });
});

describe("storeFormSchema", () => {
  it("gives the store as stored, with empty optional fields as null", () => {
    expect(storeFormSchema.parse(form())).toEqual({
      id,
      mode: "add",
      name: "Maxi ICA Stormarknad Östersund",
      chain: "ICA",
      externalStoreId: "1003733",
      address: null,
      url: "https://handlaprivatkund.ica.se/stores/1003733",
      makeSelected: false,
    });
    expect(
      storeFormSchema.parse(form({ name: "Lidl Lillänge", chain: "Lidl", externalStoreId: "  ", url: "", makeSelected: true })),
    ).toMatchObject({ externalStoreId: null, url: null, makeSelected: true });
  });

  it("trims every text to one line", () => {
    expect(
      storeFormSchema.parse(
        form({ name: "  Willys\n  Lindhagen ", externalStoreId: " 12\t34 ", address: "Lindhagensgatan 1,\r\n112 51 Stockholm" }),
      ),
    ).toMatchObject({ name: "Willys Lindhagen", externalStoreId: "12 34", address: "Lindhagensgatan 1, 112 51 Stockholm" });
  });

  it.each(["", "   ", "\n\t"])("asks for a name for %j", (name) => {
    expect(errorsOf(form({ name }))).toEqual({ name: "Ange butikens namn." });
  });

  it("counts lengths in characters, up to each field's limit", () => {
    expect(storeFormSchema.safeParse(form({ name: "å".repeat(100), externalStoreId: "1".repeat(40), address: "a".repeat(200) })).success).toBe(
      true,
    );
    expect(errorsOf(form({ name: "å".repeat(101), externalStoreId: "1".repeat(41), address: "a".repeat(201) }))).toEqual({
      name: "Texten får vara högst 100 tecken.",
      externalStoreId: "Texten får vara högst 40 tecken.",
      address: "Texten får vara högst 200 tecken.",
    });
  });

  it.each(["handla.ica.se", "http://handla.ica.se/", "javascript:alert(1)", "https://", "https:///stores", "https://ica .se/", "ftp://ica.se"])(
    "refuses the URL %j",
    (url) => {
      expect(errorsOf(form({ url }))).toEqual({ url: "Ange en adress som börjar med https://." });
    },
  );

  it("takes an https URL up to 2048 characters, with the scheme in lower case", () => {
    expect(storeFormSchema.parse(form({ url: "  HTTPS://Willys.se/butik/lindhagen " })).url).toBe("https://Willys.se/butik/lindhagen");
    const long = `https://example.com/${"a".repeat(2048 - "https://example.com/".length)}`;
    expect(storeFormSchema.parse(form({ url: long })).url).toBe(long);
    expect(errorsOf(form({ url: `${long}a` }))).toEqual({ url: "Texten får vara högst 2048 tecken." });
  });

  it("refuses a chain outside STORE_CHAINS, an id that is not one and a mode that is not add or change, without a field message", () => {
    expect(errorsOf(form({ chain: "ICA Handla" }))).toEqual({});
    expect(errorsOf(form({ id: "1003733" }))).toEqual({});
    expect(errorsOf(form({ mode: "delete" }))).toEqual({});
    expect(storeFormSchema.parse(form({ mode: "change" })).mode).toBe("change");
  });
});

describe("oneLine", () => {
  // The same characters store_name_check, store_external_store_id_check and
  // store_address_check refuse (*_settings_store_hardening.sql); the
  // integration test stores oneLine's results.
  it("removes bidi controls and turns line separators and control characters into one space", () => {
    expect(oneLine("\u202eMaxi\u202c ICA\u2066\u2069")).toBe("Maxi ICA");
    expect(oneLine("Maxi\u2028ICA\u2029Östersund")).toBe("Maxi ICA Östersund");
    expect(oneLine(" Maxi\u0007\u0085 ICA\t")).toBe("Maxi ICA");
    expect(oneLine("\u202a\u202b\u202d\u2067\u2068")).toBe("");
  });

  it("leaves nothing the table's checks refuse", () => {
    const refused = /[\u0001-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;
    const all = Array.from({ length: 0x2070 }, (_, code) => String.fromCharCode(code)).join("");
    const line = oneLine(`a${all}b`);
    expect(line).not.toMatch(refused);
    expect(line).toBe(line.trim());
  });
});

describe("newStoreId", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is a version 4 UUID, also where crypto.randomUUID is missing", () => {
    const v4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(newStoreId()).toMatch(v4);
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => real.getRandomValues(bytes) });
    const ids = new Set(Array.from({ length: 50 }, () => newStoreId()));
    expect(ids.size).toBe(50);
    for (const generated of ids) expect(generated).toMatch(v4);
  });
});

describe("normalizeStoreUrl", () => {
  it("keeps what was typed apart from the scheme's case and the ends", () => {
    expect(normalizeStoreUrl(" https://handlaprivatkund.ica.se/stores/1003733 ")).toBe(
      "https://handlaprivatkund.ica.se/stores/1003733",
    );
    expect(normalizeStoreUrl("Https://coop.se")).toBe("https://coop.se");
    expect(normalizeStoreUrl("https://coop.se/\u0007")).toBeNull();
    expect(normalizeStoreUrl("https://coop.se/\u202e")).toBeNull();
  });
});

describe("readStoreForm", () => {
  it("reads the fields, and makeSelected only from a ticked box", () => {
    const data = new FormData();
    data.set("id", id);
    data.set("mode", "add");
    data.set("name", "Willys Lindhagen");
    data.set("chain", "Willys");
    data.set("makeSelected", "true");
    data.set("url", new Blob(["x"]));
    expect(readStoreForm(data)).toEqual({
      id,
      mode: "add",
      name: "Willys Lindhagen",
      chain: "Willys",
      externalStoreId: "",
      address: "",
      url: "",
      makeSelected: true,
    });
    data.delete("makeSelected");
    expect(readStoreForm(data).makeSelected).toBe(false);
  });
});

describe("texts", () => {
  it("summarises the chain and the store id", () => {
    expect(storeSummaryText({ chain: "ICA", externalStoreId: "1003733" })).toBe("ICA · butiks-id 1003733");
    expect(storeSummaryText({ chain: "Willys", externalStoreId: null })).toBe("Willys");
  });

  it("names the selected store", () => {
    expect(selectedStoreText("Maxi ICA Stormarknad Östersund")).toBe("Maxi ICA Stormarknad Östersund är vald.");
    expect(noAddressText).toBe("Ingen adress angiven");
  });
});

describe("compareStores", () => {
  it("puts the selected store first, then sorts by name the Swedish way", () => {
    const stores = [
      store({ id: "a", name: "Östermalmshallen" }),
      store({ id: "b", name: "Willys Lindhagen", isSelected: true }),
      store({ id: "c", name: "Ålidhem" }),
      store({ id: "d", name: "Coop Forum" }),
      store({ id: "e", name: "Ängen" }),
    ];
    expect(stores.sort(compareStores).map((each) => each.name)).toEqual([
      "Willys Lindhagen",
      "Coop Forum",
      "Ålidhem",
      "Ängen",
      "Östermalmshallen",
    ]);
  });

  it("keeps stores with the same name in a fixed order", () => {
    const one = store({ id: "a", name: "ICA" });
    const two = store({ id: "b", name: "ICA" });
    expect([two, one].sort(compareStores)).toEqual([one, two]);
  });
});
