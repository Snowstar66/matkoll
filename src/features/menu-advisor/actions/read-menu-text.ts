"use server";

import { requireUser } from "@/features/auth/server";
import { getAiServiceForUser } from "@/features/settings/server";
import { fail, ok, type Result } from "@/lib/errors";
import { cleanMenuText } from "../domain/menu-text";
import { menuReaderOf } from "../domain/reading";
import { normalizeMenu } from "../domain/normalize";
import type { MenuReading } from "./read-menu";

/** The time the model gets (a standard and a careful run after each other). */
const readDeadlineMs = 120_000;

/**
 * Reads the plain text of a menu (from a restaurant's own website) into the same Menu as a photo gives: the AI port's
 * readMenu with text input, Haiku 5.5 at low effort and Sonnet 5.5 at medium when the first reading is unusable (the
 * port's escalation), through getAiServiceForUser so the daily cap is asked and the usage counted. The text is cleaned
 * (HTML left over, entities, blank runs) and cut to 12 000 characters. The text is never stored or logged. Allergens
 * are what the dish text implies, never a promise that a dish is free from one. Same result as the photo reading.
 */
export async function readMenuText(input: { text: string; quality?: "standard" | "careful" }): Promise<Result<MenuReading>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (typeof input?.text !== "string") return fail("validation");
  const text = cleanMenuText(input.text);
  if (text === "") return fail("validation");
  const quality = input.quality === "careful" ? "careful" : "standard";
  try {
    const ai = await getAiServiceForUser();
    const read = await ai.readMenu({ images: [], text, quality }, new AbortController().signal, { deadline: Date.now() + readDeadlineMs });
    if (!read.ok) return read;
    return ok({ menu: normalizeMenu(read.data.menu), quality: read.data.quality, escalated: read.data.escalated, ...menuReaderOf(read.data.quality) });
  } catch (error) {
    console.error("menu_text_read_failed", { reason: error instanceof Error ? error.name : "unknown" });
    return fail("ai_unavailable");
  }
}
