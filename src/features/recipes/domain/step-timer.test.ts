import { describe, expect, it } from "vitest";
import { findDurations, formatCountdown, splitDurations, timerCue } from "./step-timer";

const seconds = (text: string) => findDurations(text).map((found) => found.seconds);
const phrases = (text: string) => findDurations(text).map((found) => found.text);

describe("findDurations", () => {
  it.each([
    ["Koka i 10 minuter.", 600],
    ["Koka i 10 min.", 600],
    ["Fräs ca 20 minuter", 1200],
    ["Låt stå 1 timme", 3600],
    ["Ugnen 1 ½ timme", 5400],
    ["Ugnen 1½ timme", 5400],
    ["Sjud 1,5 timmar", 5400],
    ["Sjud 1.5 timmar", 5400],
    ["Stek 30 sekunder", 30],
    ["Stek 30 sek", 30],
    ["Vila en timme", 3600],
    ["Vila i en minut", 60],
    ["Låt puttra en halv timme", 1800],
    ["Rör i 45 min.", 2700],
    ["Grädda 2 tim", 7200],
    ["Grädda 1/2 timme", 1800],
    ["Grädda ½ timme", 1800],
    ["Koka 5 Minuter", 300],
  ])("%s", (text, expected) => {
    expect(seconds(text)).toEqual([expected]);
  });

  it("starts the lower bound of a range and keeps the whole phrase", () => {
    expect(seconds("Koka 2–3 minuter")).toEqual([120]);
    expect(seconds("Koka 2-3 min")).toEqual([120]);
    expect(seconds("Koka 2 till 3 minuter")).toEqual([120]);
    expect(phrases("Koka 2–3 minuter.")).toEqual(["2–3 minuter"]);
    expect(phrases("Koka 10-15 min")).toEqual(["10-15 min"]);
  });

  it("leaves ca and the dot outside the phrase", () => {
    expect(phrases("Koka ca 20 minuter.")).toEqual(["20 minuter"]);
    expect(phrases("Rör i 45 min. Sedan")).toEqual(["45 min"]);
  });

  it("joins hours and minutes into one time", () => {
    expect(seconds("Ugnen 1 timme 30 minuter")).toEqual([5400]);
    expect(seconds("Ugnen 1 timme och 15 min.")).toEqual([4500]);
    expect(phrases("Ugnen 1 timme och 15 min.")).toEqual(["1 timme och 15 min"]);
  });

  it("keeps separate times separate", () => {
    expect(seconds("Koka 5 minuter, sedan 10 minuter till")).toEqual([300, 600]);
    expect(seconds("Stek 2 min per sida och sedan 1 timme i ugn")).toEqual([120, 3600]);
    expect(seconds("Vänd efter 5 minuter och grädda 15 minuter")).toEqual([300, 900]);
  });

  it("finds a time in the middle of a sentence with its position", () => {
    const [found] = findDurations("Koka i 10 minuter och rör.");
    expect(found).toMatchObject({ start: 7, end: 17, text: "10 minuter" });
  });

  it.each([
    "Ugnen på 180 grader",
    "Ugnen på 200 °C",
    "Tillsätt 2 dl grädde",
    "Räcker till 4 portioner",
    "Ta 3 msk olja och 1 tsk salt",
    "250 g mjöl",
    "Ta fram timjan",
    "Strö över 1 timjan",
    "Gör det i en handvändning",
    "Steg 10 av 12",
    "Ett par minuter",
    "Koka 0 minuter",
    "Koka 100 timmar",
    "Du behöver en stund",
    "Minuter",
    "Koka 10 minutersbitar",
    "Efter hand",
  ])("no time in: %s", (text) => {
    expect(findDurations(text)).toEqual([]);
  });

  it("does not take a number glued to a letter", () => {
    expect(findDurations("T10 min")).toEqual([]);
  });
});

describe("splitDurations", () => {
  it("cuts the text around the times", () => {
    expect(splitDurations("Koka i 10 minuter och rör i 30 sek.")).toEqual([
      "Koka i ",
      { text: "10 minuter", seconds: 600, cue: "Koka" },
      " och rör i ",
      { text: "30 sek", seconds: 30, cue: "Rör" },
      ".",
    ]);
  });

  it("gives the text back whole when there is no time", () => {
    expect(splitDurations("Skär löken.")).toEqual(["Skär löken."]);
    expect(splitDurations("")).toEqual([]);
  });
});

describe("formatCountdown", () => {
  it("shows minutes and seconds, and hours when there are any", () => {
    expect(formatCountdown(600_000)).toBe("10:00");
    expect(formatCountdown(599_001)).toBe("10:00");
    expect(formatCountdown(59_000)).toBe("0:59");
    expect(formatCountdown(3_665_000)).toBe("1:01:05");
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(-5)).toBe("0:00");
  });
});

describe("timerCue", () => {
  const cue = (text: string, names: string[] = []) => {
    const [first] = findDurations(text);
    return first ? timerCue(text, first, names) : undefined;
  };

  it("names the recipe ingredient in the sentence, nearest the time", () => {
    expect(cue("Lägg bakpotatisarna i ugnen och baka dem i 1 timme.", ["potatis", "smör"])).toBe("Bakpotatis");
    expect(cue("Koka potatisen i 20 minuter.", ["Potatis"])).toBe("Potatis");
    expect(cue("Stek kycklingen och löken 5 minuter.", ["kycklingfilé", "gul lök"])).toBe("Gul lök");
    expect(cue("Bryn rödlöken i 3 min.", ["lök"])).toBe("Rödlök");
    // Only the sentence of the time: the potato is in the sentence before.
    expect(cue("Skala potatisen. Låt såsen puttra i 10 minuter.", ["potatis", "sås"])).toBe("Sås");
  });

  it("falls back to the words before the time, without fillers", () => {
    expect(cue("Grädda i ugnen ca 45 minuter.")).toBe("Grädda i ugnen");
    expect(cue("Ugnen på 180 grader i 1 timme.")).toBe("Ugnen på 180 grader");
    expect(cue("Låt allt stå och dra sig under locket i 10 minuter.")).toBe("Dra sig under locket");
    expect(cue("10 minuter tills det är klart.")).toBe("Det är klart");
  });

  it("is null when the sentence has nothing but the time", () => {
    expect(cue("10 minuter.")).toBeNull();
    expect(cue("I ca 10 min.")).toBeNull();
  });
});
