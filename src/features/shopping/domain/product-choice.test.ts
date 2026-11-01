import { describe, expect, it } from "vitest";
import type { ShoppingLine } from "./compute-list";
import {
  canHaveProductChoice,
  maxPackageSizeLength,
  maxProductNameLength,
  noProductChoiceText,
  noStoreText,
  productChoiceFieldErrors,
  productChoiceFormSchema,
  productChoiceRemovedText,
  productChoiceSavedText,
  productChoiceSchema,
  productChoiceText,
  productChoiceTitle,
  unlinkedCustomItemText,
} from "./product-choice";

const gradde = "11111111-1111-4111-8111-111111111111";
const maxi = "22222222-2222-4222-8222-222222222222";
const choiceId = "33333333-3333-4333-8333-333333333333";
const char = (code: number) => String.fromCodePoint(code);

const updatedAt = "2026-10-26T11:23:47.123456+00:00";
const form = (changes: Partial<Record<"ingredientId" | "storeId" | "productName" | "packageSize" | "url", string>> = {}) => ({
  ingredientId: gradde,
  storeId: maxi,
  productName: "Arla Matlagningsgrädde 15 %",
  packageSize: "5 dl",
  url: "",
  expected: null as { id: string; updatedAt: string } | null,
  ...changes,
});

function errorsOf(input: ReturnType<typeof form>): Record<string, string> {
  const parsed = productChoiceFormSchema.safeParse(input);
  expect(parsed.success).toBe(false);
  return parsed.success ? {} : productChoiceFieldErrors(parsed.error);
}

describe("productChoiceFormSchema", () => {
  it("keeps the ids and trims the fields to one line, with null for empty optional fields", () => {
    expect(productChoiceFormSchema.parse(form({ productName: "  Arla   Matlagningsgrädde\t15 %  ", packageSize: " ", url: "" }))).toEqual({
      ingredientId: gradde,
      storeId: maxi,
      productName: "Arla Matlagningsgrädde 15 %",
      packageSize: null,
      url: null,
      expected: null,
    });
  });

  it("keeps the expected choice, and refuses one that is not one", () => {
    const expected = { id: choiceId, updatedAt };
    expect(productChoiceFormSchema.parse({ ...form(), expected }).expected).toEqual(expected);
    expect(productChoiceFormSchema.safeParse({ ...form(), expected: { id: "x", updatedAt } }).success).toBe(false);
    expect(productChoiceFormSchema.safeParse({ ...form(), expected: { id: choiceId, updatedAt: "" } }).success).toBe(false);
  });

  it("counts a name of nothing but invisible marks as empty", () => {
    const invisible = [0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x061c, 0xfeff, 0x202e, 0x2066].map(char).join("");
    expect(errorsOf(form({ productName: invisible }))).toEqual({ productName: "Ange produktens namn." });
    expect(productChoiceFormSchema.parse(form({ productName: `Ar${char(0x200b)}la${char(0xfeff)}` })).productName).toBe("Arla");
  });

  it("takes an https link, with https:// in lower case", () => {
    expect(productChoiceFormSchema.parse(form({ url: " Https://www.arla.se/produkter/matlagningsgradde-15 " })).url).toBe(
      "https://www.arla.se/produkter/matlagningsgradde-15",
    );
  });

  it("asks for the product's name when it is empty or only spaces", () => {
    expect(errorsOf(form({ productName: "" }))).toEqual({ productName: "Ange produktens namn." });
    expect(errorsOf(form({ productName: `  ${char(0x2028)}\t ` }))).toEqual({ productName: "Ange produktens namn." });
  });

  it("refuses a name over 200 and a package size over 40 characters, counted in code points", () => {
    expect(errorsOf(form({ productName: "a".repeat(maxProductNameLength + 1) }))).toEqual({
      productName: "Texten får vara högst 200 tecken.",
    });
    expect(errorsOf(form({ packageSize: "a".repeat(maxPackageSizeLength + 1) }))).toEqual({
      packageSize: "Texten får vara högst 40 tecken.",
    });
    // 200 emoji are 400 UTF-16 units but 200 characters.
    expect(productChoiceFormSchema.safeParse(form({ productName: "🥛".repeat(maxProductNameLength) })).success).toBe(true);
  });

  it.each(["arla.se/produkter", "http://arla.se/", "javascript:alert(1)", "https://", "https:///path", "https://arla.se/a b"])(
    "refuses the link %s",
    (url) => {
      expect(errorsOf(form({ url }))).toEqual({ url: "Ange en adress som börjar med https://." });
    },
  );

  it("refuses a link over 2048 characters", () => {
    expect(errorsOf(form({ url: `https://arla.se/${"a".repeat(2048)}` }))).toEqual({ url: "Texten får vara högst 2048 tecken." });
  });

  it("removes bidi controls and makes control characters and line separators spaces", () => {
    const parsed = productChoiceFormSchema.parse(
      form({ productName: `Arla${char(0x202e)} Mat${char(0x2028)}grädde${char(0x07)}15 %`, packageSize: `5${char(0x0a)}dl` }),
    );
    expect(parsed.productName).toBe("Arla Mat grädde 15 %");
    expect(parsed.packageSize).toBe("5 dl");
  });

  it("refuses ids that are not ids, without a message for a field", () => {
    expect(errorsOf(form({ ingredientId: "grädde" }))).toEqual({});
    expect(errorsOf(form({ storeId: "" }))).toEqual({});
  });
});

describe("productChoiceSchema", () => {
  it("takes a stored row, with null optional fields", () => {
    const row = { id: choiceId, ingredientId: gradde, storeId: maxi, productName: "Arla", packageSize: null, url: null, updatedAt };
    expect(productChoiceSchema.parse(row)).toEqual(row);
  });

  it("refuses a row the table would refuse", () => {
    const row = { id: choiceId, ingredientId: gradde, storeId: maxi, productName: "Arla", packageSize: null, url: null, updatedAt };
    expect(productChoiceSchema.safeParse({ ...row, productName: " " }).success).toBe(false);
    expect(productChoiceSchema.safeParse({ ...row, updatedAt: undefined }).success).toBe(false);
    expect(productChoiceSchema.safeParse({ ...row, url: "http://arla.se" }).success).toBe(false);
    expect(productChoiceSchema.safeParse({ ...row, id: "x" }).success).toBe(false);
  });
});

describe("texts", () => {
  it("writes the choice with its package size, or the name alone", () => {
    expect(productChoiceText({ productName: "Arla Matlagningsgrädde 15 %", packageSize: "5 dl" })).toBe(
      "Arla Matlagningsgrädde 15 % · 5 dl",
    );
    expect(productChoiceText({ productName: "Zoégas Skånerost", packageSize: null })).toBe("Zoégas Skånerost");
  });

  it("names the sheet after the line as it runs in a sentence: only the first letter in lower case", () => {
    expect(productChoiceTitle("Grädde")).toBe("Produktval för grädde");
    expect(productChoiceTitle("Ägg")).toBe("Produktval för ägg");
    expect(productChoiceTitle("Kaffe Zoégas")).toBe("Produktval för kaffe Zoégas");
    expect(productChoiceTitle("ICA-kaffe")).toBe("Produktval för ICA-kaffe");
    expect(productChoiceTitle("ÄLG-färs")).toBe("Produktval för ÄLG-färs");
    expect(productChoiceTitle("2 citroner")).toBe("Produktval för 2 citroner");
    expect(productChoiceTitle("Å")).toBe("Produktval för å");
  });

  it("has the section's and the confirmations' texts", () => {
    expect(noProductChoiceText("Maxi ICA Stormarknad Östersund")).toBe("Inget produktval i Maxi ICA Stormarknad Östersund.");
    expect(unlinkedCustomItemText).toBe("Koppla varan till en ingrediens för att spara ett produktval.");
    expect(noStoreText).toBe("Välj en butik i inställningarna för att spara produktval.");
    expect(productChoiceSavedText).toBe("Produktvalet är sparat.");
    expect(productChoiceRemovedText).toBe("Tog bort produktvalet.");
  });
});

describe("canHaveProductChoice", () => {
  const line = (key: string, ingredientId?: string): Pick<ShoppingLine, "key" | "ingredientId"> => ({ key, ingredientId });

  it("is true for a recipe line with a catalog ingredient, also a vague one", () => {
    expect(canHaveProductChoice(line(`r:${gradde}:dl`, gradde))).toBe(true);
    expect(canHaveProductChoice(line(`r:${gradde}:-`, gradde))).toBe(true);
  });

  it("is true for an own item saved with a link, and false without one", () => {
    expect(canHaveProductChoice(line(`c:${choiceId}`, gradde))).toBe(true);
    expect(canHaveProductChoice(line(`c:${choiceId}`))).toBe(false);
  });

  it("is false for a recipe line without a catalog ingredient, and for a key that is not one", () => {
    expect(canHaveProductChoice(line("t:2 citroner"))).toBe(false);
    expect(canHaveProductChoice(line("x:what", gradde))).toBe(false);
  });
});
