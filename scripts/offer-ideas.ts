#!/usr/bin/env node
// The ideas step after `pnpm offers:fetch`, run by .github/workflows/offers.yml: prepares "Nya idéer med
// extrapris" for every household that has offers this week and no ready set, so the ideas are there before anyone
// opens the app. Households one at a time; the work for each is the app's (POST /api/offer-ideas/prepare), as a
// member of the household. Like the fetch it never reads .env.local; settings come from the environment and are never printed:
//   NEXT_PUBLIC_SUPABASE_URL               the project's URL
//   SUPABASE_SERVICE_ROLE_KEY              lists the households and signs in as a member of each
//   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY   the publishable key the members' sessions use
//   SITE_URL                               the app's address (a public repository variable, not a secret)
// Without SITE_URL it says so and ends well (the ideas are then started on the first view, as before). A household
// that fails is counted and the next view tries again, so only a setup that is wrong turns the run red (exit 1
// when every household failed).

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { signInAs, type Db } from "./fetch-offers/job.ts";
import { loadIdeaTargets, runIdeasJob } from "./offer-ideas/job.ts";

/** No new household after this long: the workflow allows the step 40 minutes, and one household takes at most ~5. */
const budgetMs = 25 * 60_000;
/** The route's own maxDuration is 300 s. */
const requestMs = 310_000;

function setting(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`offer_ideas_setting_missing ${name}`);
    process.exit(2);
  }
  return value;
}

const siteUrl = process.env.SITE_URL?.trim().replace(/\/+$/, "");
if (!siteUrl) {
  console.info("offer_ideas_skipped SITE_URL_not_set");
  process.exit(0);
}
const url = setting("NEXT_PUBLIC_SUPABASE_URL");
const publishableKey = setting("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const admin: Db = createClient<Database>(url, setting("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const summary = await runIdeasJob({
  listTargets: () => loadIdeaTargets(admin, new Date()),
  signIn: async (userId) => {
    const session = await signInAs(admin, { url, publishableKey }, userId);
    if (!session) return null;
    const held = await session.db.auth.getSession();
    const tokens = held.data.session;
    if (!tokens) throw new Error("offer_ideas_no_session");
    return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, signOut: session.signOut };
  },
  prepare: async (session) => {
    const response = await fetch(`${siteUrl}/api/offer-ideas/prepare`, {
      method: "POST",
      headers: { authorization: `Bearer ${session.accessToken}`, "x-refresh-token": session.refreshToken },
      signal: AbortSignal.timeout(requestMs),
    });
    if (!response.ok) throw new Error(`offer_ideas_http_${response.status}`);
    const body = (await response.json()) as { ok?: boolean; data?: { outcome?: unknown } };
    return typeof body.data?.outcome === "string" ? body.data.outcome : "unavailable";
  },
  now: () => Date.now(),
  budgetMs,
  log: (event, fields) => console.info(event, JSON.stringify(fields)),
});
console.info("offer_ideas_done", JSON.stringify(summary));

if (summary.households > 0 && summary.errors === summary.households) process.exitCode = 1;
