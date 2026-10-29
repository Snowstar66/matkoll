import { describe, expect, it } from "vitest";
import type { ShoppingLine } from "./compute-list";
import {
  allInStockText,
  chainSite,
  openSiteText,
  stepsText,
  backOnListAnnouncement,
  basketText,
  basketTitle,
  basketToggleText,
  missingText,
  checkLabel,
  groupByCategory,
  inBasketAnnouncement,
  lineMetaText,
  progressText,
  computedAmountText,
  copiedText,
  copyFailedText,
  exportSheetTitle,
  hiddenLinesButtonText,
  detailOriginsText,
  groupBySection,
  itemsLeft,
  itemsLeftText,
  lineAmountText,
  listSummaryText,
  originsText,
  putInPantryText,
  recountedText,
  siteGoneText,
  siteRecountedText,
  restoreFailedText,
  sendButtonText,
  skippedDishesText,
} from "./list-text";

const line = (overrides: Partial<ShoppingLine>): ShoppingLine => ({
  key: "r:x:dl",
  label: "X",
  amount: 1,
  unit: "dl",
  isVague: false,
  coverage: { kind: "missing" },
  section: "Övrigt",
  origins: [],
  checked: false,
  isCustom: false,
  ...overrides,
});

describe("list texts", () => {
  it("says how many items are left", () => {
    expect(itemsLeftText(1)).toBe("1 vara kvar");
    expect(itemsLeftText(12)).toBe("12 varor kvar");
    expect(itemsLeftText(0)).toBe("0 varor kvar");
    expect(itemsLeft([line({}), line({ checked: true }), line({})])).toBe(2);
  });

  it("sums up the plan under the title, without the items left (the progress row has them)", () => {
    expect(listSummaryText("Vecka 44", 3)).toBe("Vecka 44 · 3 rätter");
    expect(listSummaryText("Vecka 44", 1)).toBe("Vecka 44 · 1 rätt");
    // Only own items: no dish part.
    expect(listSummaryText("Vecka 44", 0)).toBe("Vecka 44");
  });

  it("says how far the shopping has come in the progress row (Story 11.4)", () => {
    expect(progressText(8, 6, 14)).toEqual({ left: "8 varor kvar", basket: "6 av 14 i korgen" });
    expect(progressText(1, 13, 14)).toEqual({ left: "1 vara kvar", basket: "13 av 14 i korgen" });
    expect(progressText(14, 0, 14)).toEqual({ left: "14 varor kvar", basket: "0 av 14 i korgen" });
    expect(progressText(0, 14, 14)).toEqual({ left: "Allt ligger i korgen", basket: null });
  });

  it("counts the basket and announces a line moving in and out of it (Story 11.4)", () => {
    expect(basketText(1)).toBe("1 vara i korgen");
    expect(basketText(6)).toBe("6 varor i korgen");
    expect(basketTitle).toBe("I korgen");
    expect(inBasketAnnouncement("Citron")).toBe("Citron i korgen.");
    expect(backOnListAnnouncement("Citron")).toBe("Citron tillbaka på listan.");
    // The user's own text is shown as written, but starts the sentence with a capital.
    expect(inBasketAnnouncement({ text: "diskmedel", own: true })).toBe("Diskmedel i korgen.");
    expect(backOnListAnnouncement({ text: "Kaffe Zoégas", own: true })).toBe("Kaffe Zoégas tillbaka på listan.");
  });

  it("says under a line where it comes from, without från (Story 11.4)", () => {
    const titles = { d1: "Korv stroganoff", d2: "Kycklinggryta", d3: "Korv stroganoff" };
    expect(lineMetaText(line({ origins: ["d1"] }), titles, null)).toBe("Korv stroganoff");
    expect(lineMetaText(line({ origins: ["d1", "d2", "d3"] }), titles, null)).toBe("Korv stroganoff · Kycklinggryta");
    expect(lineMetaText(line({ origins: [], isCustom: true }), titles, "Stugan")).toBe("Egen vara");
    expect(lineMetaText(line({ origins: ["d1"], isVague: true }), titles, null)).toBe("Saknas i lagret · Korv stroganoff");
    expect(lineMetaText(line({ origins: ["d1"], isVague: true }), titles, "Stugan")).toBe("Saknas i Stugan · Korv stroganoff");
    expect(lineMetaText(line({ origins: ["okänd"], isVague: true }), titles, null)).toBe("Saknas i lagret");
    expect(lineMetaText(line({ origins: ["okänd"] }), titles, null)).toBeNull();
    // The pantry could not be read: nothing is known to be missing.
    expect(lineMetaText(line({ origins: ["d1"], isVague: true }), titles, "Stugan", false)).toBe("Korv stroganoff");
    expect(lineMetaText(line({ origins: [], isVague: true }), titles, null, false)).toBeNull();
    expect(missingText(null)).toBe("Saknas i lagret");
    expect(missingText("Stugan")).toBe("Saknas i Stugan");
    expect(missingText("Stugan", false)).toBeNull();
  });

  it("names the basket row's button with its visible text first", () => {
    expect(basketToggleText(false, 6)).toBe("Visa I korgen (6 varor)");
    expect(basketToggleText(false, 1)).toBe("Visa I korgen (1 vara)");
    expect(basketToggleText(true, 6)).toBe("Dölj I korgen");
  });

  it("names the items Ångra could not put back", () => {
    expect(restoreFailedText([])).toBe("Det gick inte att ångra.");
    expect(restoreFailedText(["diskmedel"])).toBe("Det gick inte att ångra diskmedel.");
    expect(restoreFailedText(["Mjölk", "Kaffe"])).toBe("Det gick inte att ångra mjölk och kaffe.");
    // Story 10.4: the user's own items are shown as written.
    expect(restoreFailedText([{ text: "diskmedel", own: true }, { text: "Kaffe Zoégas", own: true }])).toBe(
      "Det gick inte att ångra diskmedel och Kaffe Zoégas.",
    );
    expect(restoreFailedText(["a", "b", "c"])).toBe("Det gick inte att ångra 3 varor.");
  });

  it("announces a recount with the items left", () => {
    expect(recountedText(4)).toBe("Inköpslistan är omräknad. 4 varor kvar.");
  });

  it("announces a list counted against another place with its name and the items left", () => {
    expect(siteRecountedText("Hemma", 3)).toBe("Listan räknas nu mot Hemma. 3 varor kvar.");
    expect(siteRecountedText("Stugan", 1)).toBe("Listan räknas nu mot Stugan. 1 vara kvar.");
  });

  it("says everything is in stock, naming the place only when there is a name to show", () => {
    expect(allInStockText(null)).toBe("Allt finns hemma.");
    expect(allInStockText("Stugan")).toBe("Allt finns i lagret för Stugan.");
    // Without inflection, so Hemma reads the same way with several places.
    expect(allInStockText("Hemma")).toBe("Allt finns i lagret för Hemma.");
  });

  it("names the dishes a line comes from, each title once", () => {
    const titles = { d1: "Krämig kycklinggryta", d2: "Linssoppa", d3: "Linssoppa" };
    expect(originsText(["d1"], titles)).toBe("från Krämig kycklinggryta");
    expect(originsText(["d2", "d1", "d3"], titles)).toBe("från Linssoppa, Krämig kycklinggryta");
    expect(originsText(["okand"], titles)).toBeNull();
    expect(originsText([], titles)).toBeNull();
  });

  it("shows the amount and the pantry beside it, and nothing for a vague line", () => {
    expect(lineAmountText(line({ amount: 3, unit: "dl" }))).toBe("3 dl");
    expect(lineAmountText(line({ amount: 1.25, unit: "dl" }))).toBe("1,25 dl");
    expect(lineAmountText(line({ amount: 2, unit: "dl", pantryNote: "hemma: 1 kg" }))).toBe("2 dl (hemma: 1 kg)");
    // Story 11.4: no "Finns hemma?"; the line under it says "Saknas i lagret".
    expect(lineAmountText(line({ amount: null, unit: null, isVague: true }))).toBe("");
    expect(lineAmountText(line({ amount: null, unit: null, coverage: { kind: "unlinked" } }))).toBe("");
    expect(lineAmountText(line({ amount: null, unit: null, coverage: { kind: "unlinked" }, multiplier: 2 }))).toBe("×2");
    expect(lineAmountText(line({ amount: null, unit: null, coverage: { kind: "unlinked" }, multiplier: 1.5 }))).toBe("×1,5");
    expect(lineAmountText(line({ amount: null, unit: null, coverage: { kind: "unlinked" }, multiplier: 1 }))).toBe("");
  });

  it("says how many dishes with deleted recipes are left out", () => {
    expect(skippedDishesText(1)).toBe("1 rätt med borttaget recept räknas inte.");
    expect(skippedDishesText(2)).toBe("2 rätter med borttagna recept räknas inte.");
  });

  it("never drops a line in a section outside SECTIONS: it is shown under Övrigt", () => {
    const groups = groupBySection([
      line({ key: "a", section: "Kyldisk" as ShoppingLine["section"] }),
      line({ key: "b", section: "Övrigt" }),
      line({ key: "c", section: "Mejeri" }),
    ]);
    expect(groups.map(({ section, lines }) => [section, lines.map((item) => item.key)])).toEqual([
      ["Mejeri", ["c"]],
      ["Övrigt", ["a", "b"]],
    ]);
  });

  it("groups lines by section in the fixed order, keeping their order", () => {
    const groups = groupBySection([
      line({ key: "a", section: "Mejeri" }),
      line({ key: "b", section: "Frukt och grönt" }),
      line({ key: "c", section: "Mejeri" }),
      line({ key: "d", section: "Övrigt" }),
    ]);
    expect(groups.map(({ section, lines }) => [section, lines.map((item) => item.key)])).toEqual([
      ["Frukt och grönt", ["b"]],
      ["Mejeri", ["a", "c"]],
      ["Övrigt", ["d"]],
    ]);
  });

  it("groups lines by display category in the store's order, keeping their order (Story 11.4)", () => {
    const groups = groupByCategory([
      line({ key: "lax", label: "Lax", section: "Kött och fisk" }),
      line({ key: "lok", label: "Gul lök", section: "Frukt och grönt" }),
      line({ key: "soja", label: "Sojasås", section: "Skafferi" }),
      line({ key: "gradde", label: "Matlagningsgrädde", section: "Mejeri" }),
      line({ key: "falukorv", label: "Falukorv", section: "Chark" }),
      line({ key: "tomat", label: "Krossade tomater", section: "Skafferi" }),
      line({ key: "okand", label: "Diskmedel", section: "Kyldisk" as ShoppingLine["section"] }),
    ]);
    expect(groups.map(({ category, lines }) => [category, lines.map((item) => item.key)])).toEqual([
      ["Frukt & grönt", ["lok"]],
      ["Mejeri & ägg", ["gradde"]],
      ["Kött, fisk & chark", ["lax", "falukorv"]],
      ["Skafferi", ["tomat"]],
      ["Såser & smaksättare", ["soja"]],
      ["Övrigt", ["okand"]],
    ]);
    expect(groupByCategory([])).toEqual([]);
  });

  it("names the check by the line's name and what it shows to the right", () => {
    expect(checkLabel(line({ label: "Paprika, röd", amount: 1, unit: "st" }))).toBe("Paprika, röd, 1 st");
    expect(checkLabel(line({ label: "Mjöl", amount: 2, unit: "dl", pantryNote: "hemma: 1 kg" }))).toBe(
      "Mjöl, 2 dl (hemma: 1 kg)",
    );
    expect(checkLabel(line({ label: "Salt", amount: null, unit: null, isVague: true }))).toBe("Salt");
    expect(checkLabel(line({ label: "En näve persilja", amount: null, unit: null }))).toBe("En näve persilja");
    expect(checkLabel(line({ label: "2 citroner", amount: null, unit: null, multiplier: 2 }))).toBe("2 citroner, ×2");
  });
});

describe("Listpostdetalj's texts (Story 3.6)", () => {
  it("says where a line comes from with a capital F, and what the list counted", () => {
    expect(detailOriginsText(["d1", "d2"], { d1: "Krämig kycklinggryta", d2: "Linssoppa" })).toBe(
      "Från Krämig kycklinggryta, Linssoppa",
    );
    expect(detailOriginsText(["okänd"], {})).toBeNull();
    expect(computedAmountText(3, "dl")).toBe("Beräknat: 3 dl");
    expect(computedAmountText(1.5, "st")).toBe("Beräknat: 1,5 st");
  });
});

describe("a correction whose counted amount has changed, and Dolda varor (Story 3.6)", () => {
  it("shows the counted amount beside the corrected one, and what is at home after it", () => {
    const corrected = line({ amount: 2, unit: "dl", computedAmount: 4, computedChanged: true });
    expect(lineAmountText(corrected)).toBe("2 dl (beräknat 4 dl)");
    expect(lineAmountText({ ...corrected, pantryNote: "hemma: 1 kg" })).toBe("2 dl (beräknat 4 dl, hemma: 1 kg)");
    expect(checkLabel({ ...corrected, label: "Grädde" })).toBe("Grädde, 2 dl (beräknat 4 dl)");
    expect(lineAmountText({ ...corrected, computedChanged: undefined })).toBe("2 dl");
  });

  it("counts the hidden lines", () => {
    expect(hiddenLinesButtonText(2)).toBe("Dolda varor (2)");
  });
});

describe("siteGoneText", () => {
  it("says the list is counted again, against the place selected now when there are more than one", () => {
    expect(siteGoneText("Hemma")).toBe("Stället finns inte längre. Listan har räknats om mot Hemma. Tryck Lägg i lagret igen.");
    expect(siteGoneText(null)).toBe("Stället finns inte längre. Listan har räknats om. Tryck Lägg i lagret igen.");
  });
});

describe("putInPantryText", () => {
  it("says how many items went to the pantry, else how many were taken off the list", () => {
    expect(putInPantryText(8, 0)).toBe("Lagt 8 varor i lagret.");
    expect(putInPantryText(1, 3)).toBe("Lagt 1 vara i lagret.");
    expect(putInPantryText(0, 1)).toBe("Tog bort 1 vara från listan.");
    expect(putInPantryText(0, 2)).toBe("Tog bort 2 varor från listan.");
    expect(putInPantryText(0, 0)).toBeNull();
  });

  it("names the place the items went to, with more than one place", () => {
    expect(putInPantryText(8, 0, "Stugan")).toBe("Lagt 8 varor i lagret för Stugan.");
    expect(putInPantryText(1, 2, "Stugan")).toBe("Lagt 1 vara i lagret för Stugan.");
    expect(putInPantryText(8, 0, null)).toBe("Lagt 8 varor i lagret.");
    expect(putInPantryText(0, 2, "Stugan")).toBe("Tog bort 2 varor från listan.");
  });
});

describe("the basket export's texts (Story 7.3)", () => {
  it("names the button after the store's chain, and the store for Annan or none", () => {
    expect(sendButtonText({ chain: "ICA" })).toBe("Kopiera till ICA-varukorgen");
    expect(sendButtonText({ chain: "Willys" })).toBe("Kopiera till Willys-varukorgen");
    expect(sendButtonText({ chain: "City Gross" })).toBe("Kopiera till City Gross-varukorgen");
    expect(sendButtonText({ chain: "Annan" })).toBe("Kopiera till varukorgen");
    expect(sendButtonText(null)).toBe("Kopiera till varukorgen");
  });

  it("says where to paste: ICA Handla for ICA, the store's site for another chain", () => {
    expect(copiedText({ chain: "ICA" })).toBe("Inköpslistan är kopierad. Klistra in den i Claude i Chrome på ICA Handla.");
    expect(copiedText({ chain: "Willys" })).toBe(
      "Inköpslistan är kopierad. Klistra in den i Claude i Chrome på butikens webbplats.",
    );
    expect(copiedText({ chain: "Annan" })).toBe(
      "Inköpslistan är kopierad. Klistra in den i Claude i Chrome på butikens webbplats.",
    );
  });

  it("says when the export has no product choices", () => {
    expect(copiedText({ chain: "ICA" }, { withoutChoices: true })).toBe(
      "Inköpslistan är kopierad utan produktval. Klistra in den i Claude i Chrome på ICA Handla.",
    );
  });

  it("says when some product choices are missing, and when the checks could not be read", () => {
    expect(copiedText({ chain: "ICA" }, { partialChoices: true })).toBe(
      "Inköpslistan är kopierad utan alla produktval. Klistra in den i Claude i Chrome på ICA Handla.",
    );
    expect(copiedText({ chain: "ICA" }, { checksUnread: true })).toBe(
      "Inköpslistan är kopierad, men bockarna gick inte att läsa. Kontrollera varukorgen.",
    );
    expect(copiedText({ chain: "Willys" }, { withoutChoices: true, checksUnread: true })).toBe(
      "Inköpslistan är kopierad utan produktval, men bockarna gick inte att läsa. Kontrollera varukorgen.",
    );
  });

  it("names the sheet and says what to do when copying is refused again", () => {
    expect(exportSheetTitle).toBe("Inköpslistan");
    expect(copyFailedText).toBe("Det gick inte att kopiera. Markera texten och kopiera den själv.");
  });

  it("names the chain in the steps, and gives the site only for a known chain (Story 14.2)", () => {
    expect(stepsText({ chain: "ICA" })[0]).toBe("Öppna ICAs webbplats och logga in");
    expect(stepsText({ chain: "Annan" })[0]).toBe("Öppna butikens webbplats och logga in");
    expect(stepsText(null)).toHaveLength(3);
    expect(chainSite({ chain: "ICA" })).toEqual({ host: "ica.se", url: "https://www.ica.se" });
    expect(chainSite({ chain: "City Gross" })?.host).toBe("citygross.se");
    expect(chainSite({ chain: "Annan" })).toBeNull();
    expect(chainSite(null)).toBeNull();
    expect(openSiteText("ica.se")).toBe("Öppna ica.se");
  });
});
