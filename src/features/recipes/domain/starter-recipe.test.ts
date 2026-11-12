import { describe, expect, it } from "vitest";
import {
  addButtonText,
  addedTitle,
  allAddedText,
  allChosen,
  asNewHousehold,
  brokenText,
  chosenText,
  cleanNote,
  continueText,
  filterStarterItems,
  keepText,
  parseStarterRecipe,
  pickerSubText,
  roomLeft,
  roomNoticeText,
  selectAll,
  selectAllText,
  selectionLimit,
  starterFilters,
  starterImageSrc,
  toStarterItems,
  type StarterListRow,
} from "./starter-recipe";

const row = (itemId: string, title: string, lineTexts: string[], extra: Partial<StarterListRow> = {}): StarterListRow => ({
  itemId,
  title,
  servings: 4,
  totalMinutes: 40,
  imageUrl: null,
  hasImage: false,
  note: null,
  lineTexts,
  copyId: null,
  ...extra,
});

const rows = [
  row("a", "Köttbullar med gräddsås", ["500 g köttfärs", "2 dl grädde"]),
  row("b", "Laxsoppa", ["400 g lax", "1 l vatten"], { totalMinutes: 25 }),
  row("c", "Linsgryta", ["2 dl röda linser", "1 burk kokosmjölk"], { copyId: "copy-c" }),
  row("d", "Pannkakor", ["3 dl vetemjöl", "6 dl mjölk", "3 ägg"]),
];

describe("starter recipes", () => {
  it("shows the stored picture when there is one, else the address on the site", () => {
    expect(starterImageSrc({ itemId: "a", hasImage: true, imageUrl: "https://x.test/a.jpg" }, "thumb")).toBe("/api/starter-image/a/thumb");
    expect(starterImageSrc({ itemId: "a", hasImage: false, imageUrl: "https://x.test/a.jpg" }, "full")).toBe("https://x.test/a.jpg");
    expect(starterImageSrc({ itemId: "a", hasImage: false, imageUrl: null }, "full")).toBeNull();
  });

  it("works out categories from the texts and carries the household's notes", () => {
    const items = toStarterItems(rows, { d: [{ kind: "allergy", text: "Kan innehålla gluten (Anna)" }] });
    expect(items.find((item) => item.itemId === "a")?.categories[0]).toBe("meat");
    expect(items.find((item) => item.itemId === "b")?.categories).toEqual(["fish", "soup", "quick"]);
    expect(items.find((item) => item.itemId === "d")?.fit).toHaveLength(1);
  });

  it("offers the categories some recipe has, and Passar alla only when an allergy is in play", () => {
    const plain = starterFilters(toStarterItems(rows));
    expect(plain.map((chip) => chip.id)).toEqual(["all", "vegetarian", "fish", "meat", "quick", "soup", "stew"]);
    expect(plain[0]).toEqual({ id: "all", label: "Alla", count: 4 });
    expect(plain.find((chip) => chip.id === "fish")?.label).toBe("Fisk");
    const items = toStarterItems(rows, { d: [{ kind: "allergy", text: "Kan innehålla gluten (Anna)" }] });
    const chips = starterFilters(items);
    expect(chips[1]).toEqual({ id: "safe", label: "Passar alla", count: 3 });
    expect(filterStarterItems(items, "safe").map((item) => item.itemId)).toEqual(["a", "b", "c"]);
    expect(filterStarterItems(items, "fish").map((item) => item.itemId)).toEqual(["b"]);
  });

  it("chooses at most what is left of the pack and of the room, and never what is added already", () => {
    const items = toStarterItems(rows);
    expect(roomLeft({ count: 398, cap: 400 })).toBe(2);
    expect(roomLeft({ count: 420, cap: 400 })).toBe(0);
    expect(selectionLimit(items, { count: 0, cap: 400 })).toBe(3);
    expect(selectionLimit(items, { count: 398, cap: 400 })).toBe(2);
    expect(selectAll(items, [], 3)).toEqual(["a", "b", "d"]);
    expect(selectAll(items, ["d"], 2)).toEqual(["d", "a"]);
    expect(allChosen(items, ["a", "b", "d"], 3)).toBe(true);
    expect(allChosen(items, ["a"], 3)).toBe(false);
    expect(allChosen(items, [], 3)).toBe(false);
  });

  it("shows the owner's preview as a new household: nothing added", () => {
    expect(asNewHousehold(rows).every((entry) => entry.copyId === null)).toBe(true);
  });

  it("says it in the sketch's words", () => {
    expect(chosenText(0, 20, false)).toBe("Inget valt");
    expect(chosenText(1, 20, false)).toBe("1 valt");
    expect(chosenText(6, 20, false)).toBe("6 valda");
    expect(chosenText(8, 8, true)).toBe("8 av 8 valda");
    expect(selectAllText(20, false)).toBe("Välj alla 20");
    expect(selectAllText(5, true)).toBe("Välj alla 5 visade");
    expect(addButtonText(0)).toBe("Välj minst ett recept");
    expect(addButtonText(6)).toBe("Lägg till 6 recept");
    expect(pickerSubText(20, 0, null, 20)).toBe("20 vardagsrätter. Välj de du vill ha.");
    expect(pickerSubText(20, 3, null, 20)).toBe("3 finns redan i er lista.");
    expect(pickerSubText(20, 0, "Fisk", 5)).toBe("Fisk. 5 av 20 visas.");
    expect(roomNoticeText({ count: 392, cap: 400 })).toBe("Receptlistan rymmer 400 recept. Ni har 392, så 8 får plats.");
    expect(allAddedText(20)).toBe("Alla 20 ligger i er receptlista. Där går de att ändra eller ta bort.");
    expect(addedTitle(14)).toBe("14 recept tillagda");
    expect(addedTitle(1)).toBe("1 recept tillagt");
    expect(brokenText(9, 14)).toBe("9 av 14 recept hann läggas till. De ligger kvar i er lista.");
    expect(continueText(5)).toBe("Fortsätt med de 5 sista");
    expect(continueText(1)).toBe("Fortsätt med det sista");
    expect(keepText(9)).toBe("Behåll de 9");
  });

  it("trims the owner's note, empties it to none, and refuses one over 140 characters", () => {
    expect(cleanNote("  Barnens favorit ")).toBe("Barnens favorit");
    expect(cleanNote("   ")).toBeNull();
    expect(cleanNote("x".repeat(141))).toBeUndefined();
  });

  it("reads get_starter_recipe's answer, and nothing that does not parse", () => {
    const answer = {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Köttbullar",
      servings: 4,
      total_minutes: 40,
      image_url: null,
      source_kind: "url",
      source_url: "https://www.example.test/kottbullar",
      household_name: "Startrecept",
      saved_copy_id: null,
      version: "abc",
      note: "Barnens favorit",
      has_image: true,
      steps: [{ title: null, text: "Stek." }],
      lines: [{ original_text: "500 g köttfärs", amount: 500, unit: "g", is_vague: false, section: null, is_staple_marked: false, step_index: 0, ingredient_name: "Köttfärs", ingredient_section: "Kött och fisk" }],
    };
    expect(parseStarterRecipe(answer)).toMatchObject({ title: "Köttbullar", note: "Barnens favorit", hasImage: true, householdName: "Startrecept" });
    expect(parseStarterRecipe(null)).toBeNull();
    expect(parseStarterRecipe({ ...answer, has_image: "yes" })).toBeNull();
  });
});
