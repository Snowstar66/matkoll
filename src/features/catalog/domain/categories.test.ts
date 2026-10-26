import { describe, expect, it } from "vitest";
import { CATEGORIES, type Category, categorySchema, compareCategories, displayCategory, SAUCE_WORDS } from "./categories";
import { SECTIONS } from "./sections";

describe("CATEGORIES", () => {
  it("has the store's order from AD-12", () => {
    expect(CATEGORIES).toEqual([
      "Frukt & grönt",
      "Bröd",
      "Mejeri & ägg",
      "Kött, fisk & chark",
      "Frys",
      "Skafferi",
      "Såser & smaksättare",
      "Dryck",
      "Övrigt",
    ]);
  });

  it("parses with categorySchema", () => {
    expect(categorySchema.parse("Mejeri & ägg")).toBe("Mejeri & ägg");
    expect(categorySchema.safeParse("Mejeri").success).toBe(false);
  });
});

describe("compareCategories", () => {
  it("sorts in the store's order", () => {
    const shuffled: Category[] = ["Övrigt", "Skafferi", "Frukt & grönt", "Såser & smaksättare", "Mejeri & ägg"];
    expect([...shuffled].sort(compareCategories)).toEqual([
      "Frukt & grönt",
      "Mejeri & ägg",
      "Skafferi",
      "Såser & smaksättare",
      "Övrigt",
    ]);
    expect(compareCategories("Bröd", "Bröd")).toBe(0);
  });
});

describe("displayCategory", () => {
  it("gives every section a category, in the same order", () => {
    expect(SECTIONS.map((section) => displayCategory(section, "x"))).toEqual([
      "Frukt & grönt",
      "Bröd",
      "Mejeri & ägg",
      "Kött, fisk & chark",
      "Kött, fisk & chark",
      "Frys",
      "Skafferi",
      "Dryck",
      "Övrigt",
    ]);
  });

  // [section, name, category]: the matrix in the spec, store items and the pitfalls.
  it.each<[string | null, string, Category]>([
    ["Frukt och grönt", "Gurka", "Frukt & grönt"],
    ["Frukt och grönt", "Sötpotatis", "Frukt & grönt"],
    ["Frukt och grönt", "Citron", "Frukt & grönt"],
    ["Bröd", "Rågbröd", "Bröd"],
    ["Mejeri", "Ost", "Mejeri & ägg"],
    ["Mejeri", "Ägg", "Mejeri & ägg"],
    ["Mejeri", "Bearnaisesås", "Mejeri & ägg"],
    ["Mejeri", "Gräddfil", "Mejeri & ägg"],
    ["Chark", "Falukorv", "Kött, fisk & chark"],
    ["Kött och fisk", "Lax", "Kött, fisk & chark"],
    ["Kött och fisk", "Kycklingfilé", "Kött, fisk & chark"],
    ["Frys", "Frysta ärtor", "Frys"],
    ["Frys", "Pepparsås", "Frys"],
    ["Dryck", "Läsk", "Dryck"],
    ["Övrigt", "Diskmedel", "Övrigt"],
    ["Skafferi", "Sojasås", "Såser & smaksättare"],
    ["Skafferi", "Steaksås", "Såser & smaksättare"],
    ["Skafferi", "Chilisås", "Såser & smaksättare"],
    ["Skafferi", "Dijonsenap", "Såser & smaksättare"],
    ["Skafferi", "Senap", "Såser & smaksättare"],
    ["Skafferi", "Grov senap", "Såser & smaksättare"],
    ["Skafferi", "Svartpeppar", "Såser & smaksättare"],
    ["Skafferi", "Flingsalt", "Såser & smaksättare"],
    ["Skafferi", "Spiskummin", "Såser & smaksättare"],
    ["Skafferi", "Tacokrydda", "Såser & smaksättare"],
    ["Skafferi", "Hönsbuljong", "Såser & smaksättare"],
    ["Skafferi", "Kalvfond", "Såser & smaksättare"],
    ["Skafferi", "Balsamvinäger", "Såser & smaksättare"],
    ["Skafferi", "Sambal oelek", "Såser & smaksättare"],
    ["Skafferi", "Sweet chili sauce", "Såser & smaksättare"],
    ["Skafferi", "Garam masala", "Såser & smaksättare"],
    ["Skafferi", "Kryddnejlikor", "Såser & smaksättare"],
    ["Skafferi", "  SOJASÅS ", "Såser & smaksättare"],
    ["Skafferi", "1 msk sojasås", "Såser & smaksättare"],
    // Not a sauce: a sauce word inside the name, not at its end.
    ["Skafferi", "Krossade tomater", "Skafferi"],
    ["Skafferi", "Saltgurka", "Skafferi"],
    ["Skafferi", "Pasta", "Skafferi"],
    ["Skafferi", "Pepparkakor", "Skafferi"],
    ["Skafferi", "Sojabönor", "Skafferi"],
    ["Skafferi", "Kanelbullar", "Skafferi"],
    ["Skafferi", "Currypasta", "Skafferi"],
    ["Skafferi", "Salta pinnar", "Skafferi"],
    ["Skafferi", "Bakpulver", "Skafferi"],
    ["Skafferi", "", "Skafferi"],
    // Written sections go through toSection.
    ["Konserver", "Majs", "Skafferi"],
    ["kryddor", "Oregano", "Såser & smaksättare"],
    ["Kött & fisk", "Torsk", "Kött, fisk & chark"],
    ["Mejerivaror", "Smör", "Mejeri & ägg"],
    [null, "x", "Övrigt"],
    ["Okänd hylla", "Sojasås", "Övrigt"],
  ])("(%j, %j) is %s", (section, name, category) => {
    expect(displayCategory(section, name)).toBe(category);
  });

  it.each(SAUCE_WORDS.map((word) => [word]))("%s in Skafferi is Såser & smaksättare", (word) => {
    const name = word.charAt(0).toLocaleUpperCase("sv-SE") + word.slice(1);
    expect(displayCategory("Skafferi", name)).toBe("Såser & smaksättare");
    expect(displayCategory("Skafferi", `Eko ${word}`)).toBe("Såser & smaksättare");
  });

  it.each(SAUCE_WORDS.map((word) => [word]))("%s outside Skafferi keeps its section's category", (word) => {
    expect(displayCategory("Mejeri", word)).toBe("Mejeri & ägg");
    expect(displayCategory("Frys", word)).toBe("Frys");
  });

  it("has no empty or repeated sauce words, all normalised", () => {
    expect(new Set(SAUCE_WORDS).size).toBe(SAUCE_WORDS.length);
    for (const word of SAUCE_WORDS) expect(word).toMatch(/^\p{Ll}+$/u);
  });
});
