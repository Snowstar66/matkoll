import { appName } from "@/app/app-info";
import { requireUser } from "@/features/auth/server";
import { listHouseholdOldItems } from "@/features/pantry/server";
import { fail, ok } from "@/lib/errors";
import { PushSendError, pushConfig, sendEatSoonIn, webPushSender } from "@/lib/push-send";
import { actAsSession } from "@/lib/supabase/acting";
import { createClient, createKeyClient } from "@/lib/supabase/server";
import { respond } from "../../ai/route-support";

// POST /api/eat-soon/notify: the daily "Ät snart" (.github/workflows/eat-soon.yml, scripts/eat-soon.ts). The job
// signs in as a member of a household with a device and calls this route with that member's session
// (Authorization: Bearer <access token>, X-Refresh-Token), as the offers job does (actAsSession, no cookie is read,
// the service role never reaches the app, AD-4). The route finds the household's items that are due today or
// overdue (per ingredient shelf life, listHouseholdOldItems) and sends ONE notification to the devices of the
// members who have "Ät snart" on. Nothing due: no notification. The household's day is claimed in the database
// (claim_eat_soon_devices) only once something is due, so a rerun the same day answers "already". Answers outcome and counts only, never a name.
export const maxDuration = 60;

function bearer(request: Request): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  return match ? match[1] : null;
}

export async function POST(request: Request): Promise<Response> {
  const accessToken = bearer(request);
  const refreshToken = request.headers.get("x-refresh-token")?.trim();
  if (!accessToken || !refreshToken) return respond(fail("unauthorized"));
  const db = createKeyClient();
  const session = await db.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (session.error || !session.data.session) return respond(fail("unauthorized"));
  return actAsSession(db, async () => {
    const user = await requireUser();
    if (!user.ok) return respond(user);
    const config = pushConfig();
    if (!config) return respond(ok({ outcome: "unavailable", due: 0, sent: 0, failed: 0, dropped: 0 }));
    let due;
    try {
      due = await listHouseholdOldItems(new Date());
    } catch (error) {
      console.error("eat_soon_items_unavailable", { reason: error instanceof Error ? error.name : "unknown" });
      return respond(ok({ outcome: "unavailable", due: 0, sent: 0, failed: 0, dropped: 0 }));
    }
    if (due.length === 0) return respond(ok({ outcome: "none", due: 0, sent: 0, failed: 0, dropped: 0 }));
    try {
      const result = await sendEatSoonIn(
        await createClient(),
        due.map((item) => ({ name: item.name, today: item.days === item.limit })),
        webPushSender(config),
        appName,
      );
      if (result.devices === 0) return respond(ok({ outcome: "already", due: due.length, sent: 0, failed: 0, dropped: 0 }));
      console.info("eat_soon_sent", { due: due.length, ...result });
      return respond(ok({ outcome: "sent", due: due.length, sent: result.sent, failed: result.failed, dropped: result.dropped }));
    } catch (error) {
      if (!(error instanceof PushSendError)) throw error;
      console.error("eat_soon_send_failed", { reason: error.detail });
      return respond(ok({ outcome: "unavailable", due: due.length, sent: 0, failed: 0, dropped: 0 }));
    }
  });
}
