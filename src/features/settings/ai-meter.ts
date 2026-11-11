import "server-only";
import { loadAiCapExemptIn, loadAiCapStatusIn } from "./data/ai-cap";
import { insertAiUsageIn, reserveAiUsageIn, settleAiUsageIn, type UsageReservation } from "./data/ai-usage";
import { SettingsDataError, type SettingsDb } from "./data/client";
import { aiCapReached } from "./domain/ai-cap";
import { usageCostSek } from "./domain/ai-usage";

// Tak för AI-kostnad, as the AI port asks it for the signed-in user (getAiServiceForUser in
// ../server.ts): the gate before each call of the port, and the reservation before each run that
// asks the model (security review 2026-11-11, S-01 to S-03). The prices stay in code
// (domain/ai-usage.ts); the database sums tokens and takes a household's reservations one at a time.

// The AI port's types, named inline: an import of the port here would reach it from the photo's save path.
type AiCapRefusal = import("@/server/ai").AiCapRefusal;
type AiUsage = import("@/server/ai").AiUsage;
type AiUsageReserver = import("@/server/ai").AiUsageReserver;

/** Only the reason of a failed database call, never data. */
function reasonOf(error: unknown): string {
  return error instanceof SettingsDataError ? error.detail : "exception";
}

/**
 * Whether the signed-in user's household may ask the model now (true), has reached today's cap (an
 * estimate of what its calls cost, open reservations included, against the cap the app's owner
 * sets), or could not be checked. Fails CLOSED (S-03): when the day's sum cannot be read, only an
 * exempt household (the owner's) is let through, so a slow or failing sum never opens the AI to
 * everyone. Never throws.
 */
export async function capGateIn(db: SettingsDb): Promise<true | AiCapRefusal> {
  try {
    const status = await loadAiCapStatusIn(db);
    if (!status || !aiCapReached(status)) return true;
    console.info("ai_cap_reached");
    return "ai_cap_reached";
  } catch (error) {
    console.error("ai_cap_check_failed", { reason: reasonOf(error) });
    return (await exemptIn(db)) ? true : "ai_cap_check_failed";
  }
}

/** Whether the household is exempt from the cap, without summing anything; false when that cannot be read either. Never throws. */
async function exemptIn(db: SettingsDb): Promise<boolean> {
  try {
    return await loadAiCapExemptIn(db);
  } catch (error) {
    console.error("ai_cap_check_failed", { reason: reasonOf(error) });
    return false;
  }
}

/**
 * Reserves a run's worst case in the signed-in user's household before the model is asked (S-02).
 * The database takes a household's reservations one at a time and answers what the household had
 * used today before this one, other calls' open reservations included; at the cap the placeholders
 * are released and the run is refused, exactly as the gate would refuse it. So parallel calls cannot
 * pass the cap together: at most the last call that started under it goes over, by its own cost.
 * A household with too many rows today (2000) is refused as at the cap. When the reservation cannot
 * be made, only an exempt household goes on (fails closed), and its usage is saved afterwards.
 * Never throws; the hold's settle may (the AI port logs it and the placeholders stay at their estimate).
 */
export async function reserveAiCallIn(db: SettingsDb, estimate: readonly AiUsage[]): ReturnType<AiUsageReserver> {
  let reserved: UsageReservation;
  try {
    reserved = await reserveAiUsageIn(db, estimate);
  } catch (error) {
    console.error("ai_cap_check_failed", { reason: reasonOf(error) });
    if (!(await exemptIn(db))) return { ok: false, code: "ai_cap_check_failed" };
    return { ok: true, hold: { settle: async (usage) => void (await Promise.all(usage.map((row) => insertAiUsageIn(db, row)))) } };
  }
  const { reservation } = reserved;
  if (!reservation) {
    console.info("ai_cap_reached", { reason: "too_many" });
    return { ok: false, code: "ai_cap_reached" };
  }
  if (aiCapReached({ capSek: reserved.capSek, exempt: reserved.exempt, spentSek: usageCostSek(reserved.today) })) {
    // Released at once; if that fails, the placeholders keep the household at the cap it is already at.
    await settleAiUsageIn(db, reservation, []).catch((error: unknown) => console.error("ai_usage_unreleased", { reason: reasonOf(error) }));
    console.info("ai_cap_reached");
    return { ok: false, code: "ai_cap_reached" };
  }
  return {
    ok: true,
    hold: {
      settle: async (usage) => {
        if (!(await settleAiUsageIn(db, reservation, usage))) console.error("ai_usage_unsettled");
      },
    },
  };
}
