import "server-only";
import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { getAiServiceForUser } from "@/features/settings/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { cleanModelText } from "@/lib/suggest-input";
import { ThingsDataError } from "../data/client";
import { loadCardNamesIn, saveCardSummaryIn } from "../data/card-text";
import { downloadCardFile, loadCardIn } from "../data/photos";

// "Uppdatera sammanfattningen" on a card: one AI call with the whole photo and the names of its föremål gives a new line
// about what the card holds and a short name; both are kept on the card (summary, ai_title). The user's own name
// (user_title) is never touched. POST /api/things/card-summary calls it, a Route Handler so the wait never holds up the
// page's other actions. The AI choice of Inställningar applies and the call is counted. Only codes are logged.

const deadlineMs = 30_000;

/**
 * Asks for a new line and name for the card `cardId` and keeps them. Fails with `unauthorized`, `validation`, `things_card_gone`
 * (gone, not the household's, or its photo is gone), `things_unavailable` or the AI port's `ai_unavailable`, `ai_rejected`,
 * `ai_invalid` and `ai_cap_reached` (nothing is kept for those).
 */
export async function refreshCardSummary(cardId: string): Promise<Result<{ summary: string | null; title: string | null }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (!z.uuid().safeParse(cardId).success) return fail("validation");

  const db = await createClient();
  let image: { data: Uint8Array; mediaType: string };
  let names: string[];
  try {
    const card = await loadCardIn(db, cardId);
    if (!card || card.status !== "done") return fail("things_card_gone");
    const file = await downloadCardFile(db, card.objectPath);
    if (!file) return fail("things_card_gone");
    image = { data: new Uint8Array(await file.arrayBuffer()), mediaType: card.mediaType };
    names = (await loadCardNamesIn(db, cardId)).map((name) => cleanModelText(name).slice(0, 80)).filter((name) => name !== "");
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_unavailable", { reason: error.detail });
    return fail("things_unavailable");
  }

  const ai = await getAiServiceForUser();
  const result = await ai.summarizeCard({ image, names }, AbortSignal.timeout(deadlineMs + 5_000), { deadline: Date.now() + deadlineMs });
  if (!result.ok) return result;
  try {
    if (!(await saveCardSummaryIn(db, cardId, result.data))) return fail("things_card_gone");
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_card_failed", { reason: error.detail });
    return fail("things_unavailable");
  }
  return ok(result.data);
}
