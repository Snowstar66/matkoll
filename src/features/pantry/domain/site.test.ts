import { describe, expect, it } from "vitest";
import {
  addedSiteText,
  canRemoveSite,
  defaultSiteName,
  emptySiteNameText,
  hasVisibleCharacter,
  maxSiteNameChars,
  maxSites,
  normalizeSiteName,
  pantrySiteRowSchema,
  type PantrySiteWithCount,
  readSiteForm,
  removedSiteText,
  renamedSiteText,
  selectedSiteLabel,
  selectedSiteText,
  shownSiteName,
  siteFieldErrors,
  siteFormSchema,
  siteLimitText,
  siteLineText,
  siteNameTakenText,
  siteNameTooLongText,
  siteSuffix,
  listCountedAgainstText,
  switchListButtonLabel,
  switchListButtonText,
  switchListTitle,
} from "./site";

describe("the texts of Story 8.5", () => {
  it("names the sheet, the button and the confirmation as EXPERIENCE.md has them", () => {
    expect(switchListTitle).toBe("Räkna listan mot");
    expect(switchListButtonText).toBe("Byt");
    expect(switchListButtonLabel).toBe("Byt boende för listan");
    expect(listCountedAgainstText("Stugan")).toBe("Listan räknas nu mot Stugan.");
    expect(listCountedAgainstText("Hemma")).toBe("Listan räknas nu mot Hemma.");
  });
});

describe("siteLineText, siteSuffix and shownSiteName", () => {
  const stugan = { id: "11111111-1111-4111-8111-111111111111", name: "Stugan", siteCount: 2 };

  it("name the place when there is more than one", () => {
    expect(siteLineText(stugan)).toBe("Boende: Stugan");
    expect(siteSuffix(stugan)).toBe(" för Stugan");
    expect(shownSiteName(stugan)).toBe("Stugan");
    expect(siteLineText({ ...stugan, name: "Hemma", siteCount: 10 })).toBe("Boende: Hemma");
  });

  it("name nothing with one place, or none, as in 1.0", () => {
    for (const site of [{ ...stugan, name: "Hemma", siteCount: 1 }, { ...stugan, siteCount: 0 }, null]) {
      expect(siteLineText(site)).toBeNull();
      expect(siteSuffix(site)).toBe("");
      expect(shownSiteName(site)).toBeNull();
    }
  });

  it("keep a long name whole, so the line wraps rather than cuts it", () => {
    const name = "a".repeat(maxSiteNameChars);
    expect(siteLineText({ ...stugan, name })).toBe(`Boende: ${name}`);
  });
});

describe("normalizeSiteName", () => {
  it.each([
    ["  Stugan ", "stugan"],
    ["STUGAN", "stugan"],
    ["Stu  gan", "stu gan"],
    ["Hemma", "hemma"],
    ["ÅRE", "åre"],
    ["Torp\tvid\nsjön", "torp vid sjön"],
  ])("gives %j as %j", (name, normalized) => {
    expect(normalizeSiteName(name)).toBe(normalized);
  });

  it("gives the same name for a composed and a decomposed letter", () => {
    const ring = String.fromCodePoint(0x030a);
    const aRing = String.fromCodePoint(0x00c5);
    expect(normalizeSiteName(`A${ring}re`)).toBe(normalizeSiteName(`${aRing}re`));
  });

  it("gives hemma for the first place", () => {
    expect(defaultSiteName).toBe("Hemma");
    expect(normalizeSiteName(defaultSiteName)).toBe("hemma");
  });

  it("has the limits from AD-24", () => {
    expect(maxSiteNameChars).toBe(40);
    expect(maxSites).toBe(10);
  });
});

describe("pantrySiteRowSchema", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  it("reads a row as a place", () => {
    expect(pantrySiteRowSchema.parse({ id, name: "Stugan", is_selected: true })).toEqual({
      id,
      name: "Stugan",
      isSelected: true,
    });
  });

  it.each([
    { id: "x", name: "Stugan", is_selected: false },
    { id, name: "", is_selected: false },
    { id, name: "a".repeat(41), is_selected: false },
    { id, name: "Stugan", is_selected: null },
  ])("refuses %j", (row) => {
    expect(pantrySiteRowSchema.safeParse(row).success).toBe(false);
  });
});

describe("the texts of Story 8.2", () => {
  it("follow EXPERIENCE.md", () => {
    expect(emptySiteNameText).toBe("Ange ett namn på boendet.");
    expect(siteNameTooLongText).toBe("Namnet får vara högst 40 tecken.");
    expect(siteNameTakenText("Stugan")).toBe("Det finns redan ett boende som heter Stugan.");
    expect(siteLimitText).toBe("Du kan ha högst 10 boenden.");
    expect(addedSiteText("Stugan")).toBe("Lade till Stugan. Välj det för att se och fylla dess matvaror.");
    expect(renamedSiteText("Vinterstugan")).toBe("Boendet heter nu Vinterstugan.");
    expect(removedSiteText("Stugan")).toBe("Tog bort Stugan.");
    expect(selectedSiteText("Stugan")).toBe("Valt boende: Stugan.");
    expect(selectedSiteLabel).toBe("Valt");
  });
});

describe("siteFormSchema", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const parse = (name: string, mode = "add") => siteFormSchema.safeParse({ id, name, mode });
  const messages = (name: string) => {
    const parsed = parse(name);
    return parsed.success ? {} : siteFieldErrors(parsed.error);
  };

  it("makes the name one line and gives its normalized form", () => {
    expect(parse("  Stugan\tvid  sjön ").data).toEqual({
      id,
      name: "Stugan vid sjön",
      normalizedName: "stugan vid sjön",
      mode: "add",
    });
    expect(parse("Vinterstugan", "rename").data?.mode).toBe("rename");
  });

  it("refuses an empty name, only spaces and only invisible characters", () => {
    for (const name of ["", "   ", "\u200b\u2066\ufeff"]) {
      expect(messages(name), JSON.stringify(name)).toEqual({ name: emptySiteNameText });
    }
  });

  it("refuses names that only look empty: format characters, fillers, soft hyphens and blank marks", () => {
    for (const name of [
      "\u00ad",
      "\u3164\u3164",
      "\u115f\u1160",
      "\uffa0",
      "\u2800",
      "\u034f",
      "\u180e",
      "\ufe0f",
      "\u{e0101}",
      "\u2060\u00a0\u3000",
    ]) {
      expect(messages(name), JSON.stringify(name)).toEqual({ name: emptySiteNameText });
    }
  });

  it("keeps a name with a visible character among invisible ones", () => {
    expect(hasVisibleCharacter("Stu\u00adgan")).toBe(true);
    expect(hasVisibleCharacter("\u3164a")).toBe(true);
    expect(hasVisibleCharacter("🏠")).toBe(true);
    expect(parse("Stu\u00adgan").success).toBe(true);
  });

  it("allows 40 characters, counted as code points, and refuses 41", () => {
    expect(parse("å".repeat(maxSiteNameChars)).success).toBe(true);
    expect(parse("🏠".repeat(maxSiteNameChars)).success).toBe(true);
    expect(messages("a".repeat(maxSiteNameChars + 1))).toEqual({ name: siteNameTooLongText });
  });

  it("refuses an id that is not one and an unknown mode, without a message for a field", () => {
    expect(siteFormSchema.safeParse({ id: "x", name: "Stugan", mode: "add" }).success).toBe(false);
    const mode = siteFormSchema.safeParse({ id, name: "Stugan", mode: "change" });
    expect(mode.success).toBe(false);
    expect(mode.success ? {} : siteFieldErrors(mode.error)).toEqual({});
  });

  it("reads the fields from FormData", () => {
    const formData = new FormData();
    formData.set("id", id);
    formData.set("name", "Stugan");
    formData.set("mode", "add");
    expect(readSiteForm(formData)).toEqual({ id, name: "Stugan", mode: "add" });
    expect(readSiteForm(new FormData())).toEqual({ id: "", name: "", mode: "" });
  });
});

describe("canRemoveSite", () => {
  const site = (id: string, itemCount: number, isSelected = false): PantrySiteWithCount => ({
    id,
    name: id,
    isSelected,
    itemCount,
  });

  it("offers Ta bort only for an empty place that is not selected and not the last", () => {
    const hemma = site("Hemma", 12, true);
    const stugan = site("Stugan", 0);
    const torpet = site("Torpet", 3);
    const sites = [hemma, stugan, torpet];
    expect(canRemoveSite(stugan, sites)).toBe(true);
    expect(canRemoveSite(hemma, sites)).toBe(false);
    expect(canRemoveSite(torpet, sites)).toBe(false);
    expect(canRemoveSite(site("Hemma", 0, true), [site("Hemma", 0, true)])).toBe(false);
    expect(canRemoveSite(stugan, [stugan])).toBe(false);
  });
});
