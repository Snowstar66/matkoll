import "server-only";
import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { getAiServiceForUser } from "@/features/settings/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { cleanModelText, cutCodePoints } from "@/lib/suggest-input";
import { cropAround } from "@/server/images";
import { ThingsDataError } from "../data/client";
import { downloadCardFile, loadCardIn } from "../data/photos";
import { applyWorthRecommendationIn, loadThingForWorthIn, saveWorthDetailIn } from "../data/worth";
import { formatWorthDetail, parseWorthDetail, worthStateOfRow, type WorthApplied, type WorthState } from "../domain/thing-worth";

// Undersök värdet and Uppdatera (Värdetips): any föremål on a card (with a star or not) asks for an assessment with one
// short AI call: whether it may be worth a closer look (the recommendation) and why, what it could be and what is worth
// checking. The photo goes cropped round the föremål when it has a box, else whole, with its name and the tip it has, if
// any. The answer is kept on the föremål (thing_item.worth_detail), so Undersök is asked once: a second tap, or another
// device, reads it; Uppdatera (`refresh`) asks again and replaces it. The user's choice about the star goes before the
// AI's, both ways: with none (worth_set_by_user null) the recommendation stars or unstars the föremål at once; with one
// nothing is changed and the answer says what the AI thinks (`suggestion`), so the sheet can offer it. The Route Handler
// POST /api/things/worth-detail calls this (maxDuration 60 s), not a Server Action, so the wait never holds up the page's
// other actions. The AI choice of Inställningar applies and the call is counted. The Tillval switch lives on the
// device and only shows the buttons. The photo is only in this request's memory; only codes are logged, never a name,
// a tip or a path.

const deadlineMs = 45_000;

/** The most characters of a name and a tip sent to the model, as thing_item holds them. */
const maxNameChars = 80;
const maxTipChars = 200;

/** The text on one line and at most `max` UTF-16 units, as the port takes it (never ending in a space). */
function fitted(text: string, max: number): string {
  let fit = cleanModelText(text);
  while (fit.length > max) fit = cleanModelText(cutCodePoints(fit, Array.from(fit).length - 1));
  return fit;
}

/** What an assessment says: the kept explanation, the AI's recommendation (when known), what was done to the star, and what the AI proposes when the user's own choice differs. */
export type WorthAssessment = {
  detail: string;
  /** `null` for an explanation kept before the recommendation existed. */
  recommends: boolean | null;
  applied: WorthApplied;
  /** The recommendation to offer as a button (true: star it, false: take the star away); `null` when nothing is to be offered. */
  suggestion: boolean | null;
  /** The star as it is now. */
  state: WorthState;
};

/**
 * The assessment of the household's föremål `thingId`: the kept explanation, or the answer of a new call (kept), always a
 * new one with `refresh`. Fails with `unauthorized`, `validation`, `things_item_gone` (gone, not the household's, or no card),
 * `things_card_gone` (its photo is gone), `things_unavailable`, or the AI port's `ai_unavailable`, `ai_rejected`, `ai_invalid`
 * and `ai_cap_reached` (nothing is kept for those).
 */
export async function explainThingWorth(thingId: string, refresh = false): Promise<Result<WorthAssessment>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (!z.uuid().safeParse(thingId).success) return fail("validation");

  const db = await createClient();
  let image: { data: Uint8Array; mediaType: string };
  let thing: NonNullable<Awaited<ReturnType<typeof loadThingForWorthIn>>>;
  try {
    const found = await loadThingForWorthIn(db, thingId);
    if (!found) return fail("things_item_gone");
    thing = found;
    if (!refresh && thing.state.detail) {
      const recommends = parseWorthDetail(thing.state.detail)?.recommends ?? null;
      return ok({ detail: thing.state.detail, recommends, applied: "unchanged", suggestion: null, state: thing.state });
    }
    const card = await loadCardIn(db, thing.photoId);
    if (!card) return fail("things_item_gone");
    const file = await downloadCardFile(db, card.objectPath);
    if (!file) return fail("things_card_gone");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const cropped = thing.box ? await cropAround(bytes, thing.box) : null;
    image = cropped ?? { data: bytes, mediaType: card.mediaType };
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_unavailable", { reason: error.detail });
    return fail("things_unavailable");
  }

  const name = fitted(thing.name, maxNameChars);
  if (name === "") return fail("validation");
  const tipText = thing.state.tip ? fitted(thing.state.tip.why, maxTipChars) : "";
  const hasTip = thing.state.tip !== null && tipText !== "";
  const ai = await getAiServiceForUser();
  const explained = await ai.explainWorth(
    { image, name, tip: hasTip ? tipText : null, confidence: hasTip ? thing.state.tip!.confidence : null },
    AbortSignal.timeout(deadlineMs + 5_000),
    { deadline: Date.now() + deadlineMs },
  );
  if (!explained.ok) return explained;

  const answer = explained.data;
  const text = formatWorthDetail({ why: answer.darfor, couldBe: answer.kan_vara, checks: answer.undersok, search: answer.sokfras, recommends: answer.recommends });
  // An answer with nothing in it is the model's failure, not a kept empty explanation.
  if (!text) return fail("ai_invalid");
  try {
    await saveWorthDetailIn(db, thing.id, text, refresh);
  } catch (error) {
    // The explanation is shown anyway; the next tap asks again.
    console.error("things_worth_detail_save_failed", { reason: error instanceof ThingsDataError ? error.detail : "unknown" });
  }

  // The star: with no choice of the user's the recommendation decides; with one it is only offered.
  let state = thing.state;
  let applied: WorthApplied = "unchanged";
  let suggestion: boolean | null = null;
  if (thing.userChoice === null) {
    const tip = answer.recommends && answer.tip !== "" ? { why: fitted(answer.tip, maxTipChars), confidence: answer.confidence } : null;
    // A recommendation without a sentence still stars: the explanation's first part is the sentence.
    const starTip = answer.recommends ? (tip ?? { why: fitted(answer.darfor, maxTipChars), confidence: answer.confidence }) : null;
    try {
      if (await applyWorthRecommendationIn(db, thing.id, starTip)) {
        const next = worthStateOfRow({ worth_why: starTip?.why ?? null, worth_confidence: starTip?.confidence ?? null, worth_detail: text, worth_set_by_user: null });
        applied = next.starred === thing.state.starred ? "unchanged" : next.starred ? "starred" : "unstarred";
        state = next;
      }
    } catch (error) {
      console.error("things_worth_apply_failed", { reason: error instanceof ThingsDataError ? error.detail : "unknown" });
    }
  } else if (answer.recommends !== thing.state.starred) {
    suggestion = answer.recommends;
    state = { ...thing.state, detail: text };
  } else {
    state = { ...thing.state, detail: text };
  }
  console.info("things_worth_explained", { cropped: thing.box !== null, applied, refreshed: refresh });
  return ok({ detail: text, recommends: answer.recommends, applied, suggestion, state: { ...state, detail: text } });
}
