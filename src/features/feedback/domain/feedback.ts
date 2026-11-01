import { z } from "zod";
import { appName } from "@/app/app-info";

// Tyck till (Story 20.3): what a user can send, how it is checked, and how the
// owner's inbox shows it. Pure, so the sheet, the action and the inbox share it.

/** The three sheets, by the `?tyck=` value the Hjälp rows use (Story 20.2). */
export const feedbackSheetKinds = ["idea", "rate", "problem"] as const;
export type FeedbackSheetKind = (typeof feedbackSheetKinds)[number];

/** What is stored in `feedback.kind`. */
export const feedbackKinds = ["idea", "rating", "problem"] as const;
export type FeedbackKind = (typeof feedbackKinds)[number];

export function storedKindOf(sheet: FeedbackSheetKind): FeedbackKind {
  return sheet === "rate" ? "rating" : sheet;
}

export function isFeedbackSheetKind(value: unknown): value is FeedbackSheetKind {
  return typeof value === "string" && (feedbackSheetKinds as readonly string[]).includes(value);
}

/** The help areas a message can be about (the chips "Gäller"); the ids are Hjälp's (help-content.ts). */
export const feedbackAreas = [
  { id: "recept", label: "Recept" },
  { id: "matsedel", label: "Matsedel" },
  { id: "inkopslista", label: "Inköpslista" },
  { id: "matvaror", label: "Matvaror" },
  { id: "forrad", label: "Förråd" },
  { id: "konto", label: "Konto" },
] as const;
export type FeedbackAreaId = (typeof feedbackAreas)[number]["id"];

const areaIds = feedbackAreas.map((area) => area.id) as [FeedbackAreaId, ...FeedbackAreaId[]];

export function isFeedbackArea(value: unknown): value is FeedbackAreaId {
  return typeof value === "string" && (areaIds as readonly string[]).includes(value);
}

export function areaLabel(id: string | null): string | null {
  return feedbackAreas.find((area) => area.id === id)?.label ?? null;
}

/** The longest text a message may have; the field stops there. */
export const maxFeedbackChars = 2000;
/** The longest page address that is kept. */
export const maxPageChars = 200;

/** The page the sender came from: a path in the app, or nothing. */
const pageSchema = z
  .string()
  .max(maxPageChars)
  .regex(/^\/[^\s]*$/)
  .nullable();

const textSchema = z.string().transform((text) => text.trim()).pipe(z.string().max(maxFeedbackChars));

/** What the sheet sends. A rating has 1–5 stars and an optional text; an idea or a problem has a text. */
export const feedbackInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("idea"),
    body: textSchema.pipe(z.string().min(1)),
    area: z.enum(areaIds).nullable(),
    page: pageSchema,
  }),
  z.object({
    kind: z.literal("problem"),
    body: textSchema.pipe(z.string().min(1)),
    area: z.enum(areaIds).nullable(),
    page: pageSchema,
  }),
  z.object({
    kind: z.literal("rating"),
    stars: z.number().int().min(1).max(5),
    body: textSchema,
    page: pageSchema,
  }),
]);

export type FeedbackInput = z.input<typeof feedbackInputSchema>;
export type ValidFeedback = z.output<typeof feedbackInputSchema>;

/** The word under the stars: Dåligt · Sådär · Okej · Bra · Toppen. */
export const starWords = ["Dåligt", "Sådär", "Okej", "Bra", "Toppen"] as const;

export function starWord(stars: number): string {
  return starWords[stars - 1] ?? "";
}

/** The question above the text in the rating sheet: what could be better at 1–3 stars. */
export function ratingQuestion(stars: number): string {
  return stars > 0 && stars <= 3 ? "Vad kan bli bättre?" : "Något mer du vill säga?";
}

/** The sheet's title, its field's question and the line about what is sent. */
export function sheetText(kind: FeedbackSheetKind, ownerName: string | null) {
  const owner = ownerName ?? "Den som gör appen";
  switch (kind) {
    case "idea":
      return {
        title: "Föreslå en funktion",
        question: `Vad skulle göra ${appName} bättre för dig?`,
        hint: `${owner} ser texten, ditt namn och sidan du var på.`,
      };
    case "problem":
      return {
        title: "Något som inte funkar?",
        question: "Vad hände? Vad hade du väntat dig?",
        hint: `Sidan du var på och appversionen skickas med, så ${ownerName ?? "den som gör appen"} kan se vad som hände.`,
      };
    case "rate":
      return { title: `Betygsätt ${appName}`, question: `Hur tycker du att ${appName} fungerar?`, hint: "" };
  }
}

/** "Tack! Det hamnar hos Pontus." */
export function thanksText(ownerName: string | null): string {
  return ownerName ? `Det hamnar hos ${ownerName}.` : "Det hamnar hos den som gör appen.";
}

// ---------- the inbox ----------

/** One message as the inbox shows it. */
export type FeedbackItem = {
  id: string;
  kind: FeedbackKind;
  stars: number | null;
  body: string;
  area: string | null;
  page: string | null;
  appVersion: string | null;
  senderEmail: string;
  userId: string;
  createdAt: string;
  readAt: string | null;
};

/** The chips of the inbox: Förslag · Betyg · Fel. */
export const kindLabels: Record<FeedbackKind, string> = { idea: "Förslag", rating: "Betyg", problem: "Fel" };

export function kindCounts(items: readonly FeedbackItem[]): Record<FeedbackKind, number> {
  const counts: Record<FeedbackKind, number> = { idea: 0, rating: 0, problem: 0 };
  for (const item of items) counts[item.kind] += 1;
  return counts;
}

/** "Förslag · Inköpslista", "Fel", or null for a rating (it shows its stars). */
export function kindLine(item: Pick<FeedbackItem, "kind" | "area">): string | null {
  if (item.kind === "rating") return null;
  const area = areaLabel(item.area);
  return area ? `${kindLabels[item.kind]} · ${area}` : kindLabels[item.kind];
}

const dayMs = 24 * 60 * 60 * 1000;

/**
 * The average rating: each person's latest rating from the last 30 days, so one person
 * rating often does not weigh more. Null when there is none.
 */
export function averageRating(items: readonly FeedbackItem[], now: Date): { average: number; count: number } | null {
  const since = now.getTime() - 30 * dayMs;
  const latest = new Map<string, FeedbackItem>();
  for (const item of items) {
    if (item.kind !== "rating" || item.stars === null) continue;
    const at = Date.parse(item.createdAt);
    if (at < since) continue;
    const before = latest.get(item.userId);
    if (!before || Date.parse(before.createdAt) < at) latest.set(item.userId, item);
  }
  if (latest.size === 0) return null;
  const total = [...latest.values()].reduce((sum, item) => sum + (item.stars ?? 0), 0);
  return { average: total / latest.size, count: latest.size };
}

/** "4,0". */
export function averageText(average: number): string {
  return average.toFixed(1).replace(".", ",");
}

/** "Snittbetyg, 2 betyg senaste 30 dagarna". */
export function averageCaption(count: number): string {
  return `Snittbetyg, ${count} betyg senaste 30 dagarna`;
}

const months = ["jan", "feb", "mars", "apr", "maj", "juni", "juli", "aug", "sep", "okt", "nov", "dec"];

const stockholmParts = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function partsOf(date: Date) {
  const parts = Object.fromEntries(stockholmParts.formatToParts(date).map((part) => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), time: `${parts.hour}:${parts.minute}` };
}

/** Days between two Stockholm calendar dates. */
function dayNumber({ year, month, day }: { year: number; month: number; day: number }): number {
  return Math.round(Date.UTC(year, month - 1, day) / dayMs);
}

/** When it came, in Stockholm time: "21:14" today, "i går", "28 okt", and with the year when it is not this year. */
export function receivedText(iso: string, now: Date): string {
  const at = partsOf(new Date(iso));
  const today = partsOf(now);
  const days = dayNumber(today) - dayNumber(at);
  if (days <= 0) return at.time;
  if (days === 1) return "i går";
  const date = `${at.day} ${months[at.month - 1]}`;
  return at.year === today.year ? date : `${date} ${at.year}`;
}
