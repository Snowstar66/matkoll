import { describe, expect, it } from "vitest";
import { estimateTotalSek } from "./drinks";
import { dish, menuOf, person } from "./fixtures";
import { buildShareText } from "./share-text";

describe("buildShareText", () => {
  const biff = dish({ originalnamn: "Biff", pris: 15, valuta: "EUR" });
  const gryta = dish({ originalnamn: "Fiskgryta", pris: 100 });
  const tiramisu = dish({ originalnamn: "Tiramisu", pris: 60 });
  const menu = menuOf([biff, gryta, tiramisu]);
  const people = [person({ id: "a", name: "Anna", drink: "vin" }), person({ id: "b", name: "Bo", drink: null })];

  it("reads as a short message with who eats what, prices, total and the allergy note", () => {
    const selection = [
      { personId: "a", dish: biff },
      { personId: "a", dish: tiramisu },
      { personId: "b", dish: gryta },
    ];
    const text = buildShareText(menu, selection, estimateTotalSek(selection, menu, people));
    expect(text).toBe(
      [
        "Förslag till middag på Casa Pepe:",
        "- Anna: Biff + Tiramisu, ca 320 kr inkl. vin",
        "- Bo: Fiskgryta, ca 100 kr",
        "Totalt ca 420 kr (drycker är uppskattade).",
        "Allergiinformationen är en gissning utifrån menyn och kan vara fel eller ofullständig. Fråga alltid personalen innan du beställer, särskilt vid allvarlig allergi.",
      ].join("\n"),
    );
  });

  it("works without a restaurant name, notes unpriced dishes and stays short for a big party", () => {
    const many = Array.from({ length: 12 }, (_, i) => person({ id: `p${i}`, name: `P${i}` }));
    const selection = many.map((p) => ({ personId: p.id, dish: dish({ pris: null, valuta: null }) }));
    const text = buildShareText({ ...menu, restaurang: null }, selection, estimateTotalSek(selection, menu, many));
    const lines = text.split("\n");
    expect(lines[0]).toBe("Förslag till middag:");
    expect(lines).toContain("- … och 4 till");
    expect(lines).toContain("12 rätter saknar pris och räknas inte med.");
    expect(lines.length).toBeLessThanOrEqual(15);
  });
});
