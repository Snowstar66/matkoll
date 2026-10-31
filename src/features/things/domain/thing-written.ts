import { z } from "zod";
import { charLength, oneLine } from "@/lib/one-line";
import type { ThingCategory } from "./thing";
import { thingsText } from "./thing-room";
import { shortDateText } from "./thing-photo";
import { appName } from "@/app/app-info";

// "Skriv vad som finns" (Story 18.13): what a box holds, written by hand. One
// thing per line or separated by commas, with a quantity ("2 st") that stays
// on its thing. The things belong to the box without a card. Pure.

/** The longest name of a thing, as the table's check has it. */
export const maxWrittenNameChars = 80;
/** The most things a box can have written, as replace_box_things allows. */
export const maxWrittenThings = 100;
/** The longest text, in characters: room for the most things of the longest names. */
export const maxWrittenTextChars = 4_000;

/** A segment that is only a quantity: "2", "2 st", "2 stycken", "2x". */
const quantityOnly = /^(\d{1,4})\s*(?:st|stycken|x|pcs)?\.?$/i;

function capitalize(name: string): string {
  const [first = "", ...rest] = [...name];
  return first.toLocaleUpperCase("sv") + rest.join("");
}

/**
 * The names in `text`: lines and commas separate things; a segment that is
 * only a quantity belongs to the thing before it ("adventsljusstake, 2 st");
 * a list mark ("-", "•") and extra spaces are dropped, the first letter is a
 * capital and a thing written twice is kept once. `null` for a text that
 * cannot be saved (`error` says why).
 */
export function parseWrittenThings(text: string): { names: string[] } | { error: string } {
  if (charLength(text) > maxWrittenTextChars) return { error: tooLongTextText };
  const names: string[] = [];
  for (const line of text.split(/\r\n|\r|\n/)) {
    for (const segment of line.split(/[,;]/)) {
      const clean = oneLine(segment).replace(/^[-*•–]+\s*/, "").trim();
      if (clean === "") continue;
      const quantity = quantityOnly.exec(clean);
      if (quantity && names.length > 0 && !/,\s*\d+ st$/.test(names[names.length - 1])) {
        names[names.length - 1] = `${names[names.length - 1]}, ${quantity[1]} st`;
        continue;
      }
      names.push(capitalize(clean));
    }
  }
  const seen = new Set<string>();
  const unique = names.filter((name) => {
    const key = name.toLocaleLowerCase("sv");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (unique.some((name) => charLength(name) > maxWrittenNameChars)) return { error: nameTooLongWrittenText };
  if (unique.length > maxWrittenThings) return { error: tooManyThingsText };
  return { names: unique };
}

/** What the box's text field holds for the names saved: one per line. */
export function writtenToText(names: readonly string[]): string {
  return names.join("\n");
}

/** The input of saving a box's text. */
export const writtenInputSchema = z.object({ placeId: z.uuid(), text: z.string().max(maxWrittenTextChars * 2) });

/** A thing with its category, as saved. */
export type WrittenThing = { name: string; category: ThingCategory };

/** A box with written things, as the room's Kort view lists it. */
export type WrittenBox = { placeId: string; part: string; things: number; writtenAt: Date };

/** "skrivet · 6 prylar" (Kort view), or with the date: "skrivet 31 okt · 6 prylar". */
export function writtenMeta(box: Pick<WrittenBox, "things" | "writtenAt">): string {
  return `skrivet ${shortDateText(box.writtenAt)} · ${thingsText(box.things)}`;
}

export const writtenTitleText = "Vad finns i lådan?";
export const writtenHintText = `En sak per rad eller med komma. ${appName} sorterar i kategorier.`;
export const writtenPlaceholder = "Till exempel julgransbelysning";
export const saveWrittenText = "Spara";
export const savingWrittenText = "Sorterar …";
export const photoInsteadText = "Fota insidan i stället";
export const writeInsteadText = "Skriv vad som finns i stället";
export const writtenEditText = "Ändra";
export const emptyWrittenText = "Skriv minst en pryl, eller tryck Spara med tom ruta för att tömma lådan.";
export const tooLongTextText = `Texten får vara högst ${maxWrittenTextChars} tecken.`;
export const nameTooLongWrittenText = `En pryl får vara högst ${maxWrittenNameChars} tecken. Dela upp raden.`;
export const tooManyThingsText = `Du kan skriva högst ${maxWrittenThings} prylar i en låda.`;
export const writtenFailedText = "Det gick inte att spara. Försök igen.";
export const writtenUncategorizedText = "Sparat, men utan kategorier: AI svarade inte. De ligger under Övrigt.";

/** "Sparat: 6 prylar". */
export function writtenSavedText(count: number): string {
  return count === 0 ? "Lådan är tömd på inskrivna prylar." : `Sparat: ${thingsText(count)}`;
}

/** "Dessutom 12 prylar från kort." for a box that also has photographed things. */
export function alsoPhotographedText(count: number): string {
  return `Dessutom ${thingsText(count)} från kort.`;
}

/** The line under a box in the room's list of boxes: "2 kort · skrivet 6 prylar", or "Inget än" for an empty box. */
export function boxMeta(box: { cards: number; written: number }): string {
  const parts = [box.cards > 0 ? `${box.cards} kort` : null, box.written > 0 ? `skrivet ${thingsText(box.written)}` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Inget än";
}

export const boxesLabelText = "Lådor";
