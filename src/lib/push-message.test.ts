import { describe, expect, it } from "vitest";
import { eatSoonMessage, pushMessageFor } from "./push-message";

describe("pushMessageFor", () => {
  it("collects several new items into one line", () => {
    expect(pushMessageFor({ kind: "lista", count: 3, actorName: null, noteText: null }, "Livskoll")).toEqual({
      title: "Livskoll",
      body: "3 nya varor på listan",
      url: "/lista",
      tag: "lista",
    });
    expect(pushMessageFor({ kind: "lista", count: 1, actorName: null, noteText: null }, "Livskoll").body).toBe("1 ny vara på listan");
  });

  it("counts cards and says the meal plan changed without a number", () => {
    expect(pushMessageFor({ kind: "forrad", count: 2, actorName: null, noteText: null }, "Livskoll").body).toBe("2 nya kort i Förråd");
    expect(pushMessageFor({ kind: "forrad", count: 1, actorName: null, noteText: null }, "Livskoll").body).toBe("1 nytt kort i Förråd");
    expect(pushMessageFor({ kind: "matsedel", count: 4, actorName: null, noteText: null }, "Livskoll").body).toBe("Matsedeln har ändrats");
  });

  it("shows a single note with its author, and several as a count", () => {
    expect(pushMessageFor({ kind: "lappar", count: 1, actorName: "Pontus", noteText: "Fisksoppa?" }, "Livskoll")).toMatchObject({
      title: "Pontus skrev en lapp",
      body: "Fisksoppa?",
    });
    expect(pushMessageFor({ kind: "lappar", count: 1, actorName: null, noteText: "Hej" }, "Livskoll").title).toBe("Ny lapp");
    expect(pushMessageFor({ kind: "lappar", count: 2, actorName: "Pontus", noteText: null }, "Livskoll").body).toBe("2 nya lappar");
  });
});

describe("eatSoonMessage", () => {
  const due = (name: string, today = false) => ({ name, today });

  it("says idag for one item on exactly its last day and opens Matvaror", () => {
    expect(eatSoonMessage([due("Köttfärs", true)], "Livskoll")).toEqual({
      title: "Livskoll",
      body: "Köttfärs bör användas idag",
      url: "/hemma",
      tag: "atsnart",
    });
  });

  it("says snart for one overdue item, and for several", () => {
    expect(eatSoonMessage([due("Köttfärs")], "Livskoll")?.body).toBe("Köttfärs bör användas snart");
    expect(eatSoonMessage([due("Grädde", true), due("Köttfärs", true)], "Livskoll")?.body).toBe("Grädde och köttfärs bör användas snart");
  });

  it("lists a few names and counts the rest", () => {
    expect(eatSoonMessage([due("Grädde"), due("Köttfärs"), due("Lax")], "Livskoll")?.body).toBe("Grädde, köttfärs och lax bör användas snart");
    expect(eatSoonMessage(["Grädde", "Köttfärs", "Lax", "Sallad", "Dill"].map((name) => due(name)), "Livskoll")?.body).toBe(
      "Grädde, köttfärs, lax och 2 till bör användas snart",
    );
  });

  it("sends nothing when nothing is due", () => {
    expect(eatSoonMessage([], "Livskoll")).toBeNull();
    expect(eatSoonMessage([due("  ")], "Livskoll")).toBeNull();
  });
});
