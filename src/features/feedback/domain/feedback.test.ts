import { describe, expect, it } from "vitest";
import {
  type FeedbackItem,
  averageCaption,
  averageRating,
  averageText,
  feedbackInputSchema,
  isFeedbackArea,
  isFeedbackSheetKind,
  kindCounts,
  kindLine,
  maxFeedbackChars,
  ratingQuestion,
  receivedText,
  sheetText,
  starWord,
  storedKindOf,
  thanksText,
} from "./feedback";

// Tyck till (Story 20.3): what may be sent, and how the owner's inbox reads it.

describe("feedbackInputSchema", () => {
  it("takes an idea or a problem with a text, an optional area and the page", () => {
    expect(feedbackInputSchema.parse({ kind: "idea", body: "  Dela listan  ", area: "inkopslista", page: "/lista" })).toEqual({
      kind: "idea",
      body: "Dela listan",
      area: "inkopslista",
      page: "/lista",
    });
    expect(feedbackInputSchema.safeParse({ kind: "problem", body: "Ångra försvann", area: null, page: null }).success).toBe(true);
  });

  it("refuses an empty or too long text, an unknown area and a page that is not a path", () => {
    const idea = { kind: "idea", area: null, page: "/lista" } as const;
    expect(feedbackInputSchema.safeParse({ ...idea, body: "   " }).success).toBe(false);
    expect(feedbackInputSchema.safeParse({ ...idea, body: "x".repeat(maxFeedbackChars + 1) }).success).toBe(false);
    expect(feedbackInputSchema.safeParse({ ...idea, body: "x".repeat(maxFeedbackChars) }).success).toBe(true);
    expect(feedbackInputSchema.safeParse({ ...idea, body: "x", area: "kyl" }).success).toBe(false);
    expect(feedbackInputSchema.safeParse({ ...idea, body: "x", page: "https://evil.example" }).success).toBe(false);
    expect(feedbackInputSchema.safeParse({ ...idea, body: "x", page: `/${"a".repeat(200)}` }).success).toBe(false);
  });

  it("takes a rating of 1 to 5 whole stars, with or without a text, and nothing else as a rating", () => {
    expect(feedbackInputSchema.parse({ kind: "rating", stars: 4, body: "", page: null })).toEqual({ kind: "rating", stars: 4, body: "", page: null });
    for (const stars of [0, 6, 2.5, -1]) {
      expect(feedbackInputSchema.safeParse({ kind: "rating", stars, body: "", page: null }).success, String(stars)).toBe(false);
    }
    expect(feedbackInputSchema.safeParse({ kind: "rating", body: "", page: null }).success).toBe(false);
    expect(feedbackInputSchema.safeParse({ kind: "praise", body: "Bra", page: null }).success).toBe(false);
  });
});

describe("the sheets", () => {
  it("knows the three sheets of the Hjälp rows and what each is stored as", () => {
    expect(["idea", "rate", "problem"].every(isFeedbackSheetKind)).toBe(true);
    expect(isFeedbackSheetKind("rating")).toBe(false);
    expect(isFeedbackSheetKind(null)).toBe(false);
    expect(storedKindOf("rate")).toBe("rating");
    expect(storedKindOf("idea")).toBe("idea");
    expect(isFeedbackArea("forrad")).toBe(true);
    expect(isFeedbackArea("hemma")).toBe(false);
  });

  it("names the owner in the line about what is sent and in the thanks", () => {
    expect(sheetText("idea", "Pontus")).toEqual({
      title: "Föreslå en funktion",
      question: "Vad skulle göra Livskoll bättre för dig?",
      hint: "Pontus ser texten, ditt namn och sidan du var på.",
    });
    expect(sheetText("problem", "Pontus").hint).toBe("Sidan du var på och appversionen skickas med, så Pontus kan se vad som hände.");
    expect(sheetText("rate", "Pontus").title).toBe("Betygsätt Livskoll");
    expect(thanksText("Pontus")).toBe("Det hamnar hos Pontus.");
    expect(thanksText(null)).toBe("Det hamnar hos den som gör appen.");
    expect(sheetText("idea", null).hint).toBe("Den som gör appen ser texten, ditt namn och sidan du var på.");
  });

  it("gives each star its word and asks what could be better at 1 to 3 stars", () => {
    expect([1, 2, 3, 4, 5].map(starWord)).toEqual(["Dåligt", "Sådär", "Okej", "Bra", "Toppen"]);
    expect(starWord(0)).toBe("");
    expect(ratingQuestion(2)).toBe("Vad kan bli bättre?");
    expect(ratingQuestion(3)).toBe("Vad kan bli bättre?");
    expect(ratingQuestion(4)).toBe("Något mer du vill säga?");
    expect(ratingQuestion(0)).toBe("Något mer du vill säga?");
  });
});

const now = new Date("2026-11-01T20:30:00Z"); // 21:30 in Stockholm

function item(partial: Partial<FeedbackItem>): FeedbackItem {
  return {
    id: crypto.randomUUID(),
    kind: "idea",
    stars: null,
    body: "",
    area: null,
    page: null,
    appVersion: "0.1.0",
    senderEmail: "anna@example.se",
    userId: "a",
    createdAt: now.toISOString(),
    readAt: null,
    ...partial,
  };
}

describe("the inbox", () => {
  it("averages each person's latest rating from the last 30 days", () => {
    const items = [
      item({ kind: "rating", stars: 2, userId: "a", createdAt: "2026-10-20T10:00:00Z" }),
      item({ kind: "rating", stars: 5, userId: "a", createdAt: "2026-10-28T10:00:00Z" }),
      item({ kind: "rating", stars: 3, userId: "b", createdAt: "2026-11-01T16:02:00Z" }),
      item({ kind: "rating", stars: 1, userId: "c", createdAt: "2026-09-01T10:00:00Z" }),
      item({ kind: "idea", userId: "d" }),
    ];
    expect(averageRating(items, now)).toEqual({ average: 4, count: 2 });
    expect(averageText(4)).toBe("4,0");
    expect(averageText(3.666)).toBe("3,7");
    expect(averageCaption(2)).toBe("Snittbetyg, 2 betyg senaste 30 dagarna");
    expect(averageRating([item({ kind: "idea" })], now)).toBeNull();
  });

  it("counts the kinds and writes the line under the name", () => {
    expect(kindCounts([item({ kind: "idea" }), item({ kind: "idea" }), item({ kind: "rating", stars: 4 })])).toEqual({ idea: 2, rating: 1, problem: 0 });
    expect(kindLine({ kind: "idea", area: "inkopslista" })).toBe("Förslag · Inköpslista");
    expect(kindLine({ kind: "problem", area: "matvaror" })).toBe("Fel · Matvaror");
    expect(kindLine({ kind: "problem", area: null })).toBe("Fel");
    expect(kindLine({ kind: "rating", area: null })).toBeNull();
  });

  it("says when it came in Stockholm time: the time today, i går, the date, the year when not this year", () => {
    expect(receivedText("2026-11-01T20:14:00Z", now)).toBe("21:14");
    expect(receivedText("2026-10-31T23:30:00Z", now)).toBe("00:30");
    expect(receivedText("2026-10-31T12:00:00Z", now)).toBe("i går");
    expect(receivedText("2026-10-28T12:00:00Z", now)).toBe("28 okt");
    expect(receivedText("2025-12-24T12:00:00Z", now)).toBe("24 dec 2025");
  });
});
