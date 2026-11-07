#!/usr/bin/env node
// The daily "Ät snart" job, run by .github/workflows/eat-soon.yml: asks the app to tell every household with a device
// about the food that is due today or overdue (POST /api/eat-soon/notify, as a member of the household). Like the offers
// job it never reads .env.local; settings come from the environment and are never printed:
//   NEXT_PUBLIC_SUPABASE_URL               the project's URL
//   SUPABASE_SERVICE_ROLE_KEY              lists the households and signs in as a member of each
//   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY   the publishable key the members' sessions use
//   SITE_URL                               the app's address (a public repository variable, not a secret)
// Without SITE_URL it says so and ends well. A household that fails is counted and tomorrow tries again, so only a
// setup that is wrong turns the run red (exit 1 when every household failed).

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { signInAs, type Db } from "./fetch-offers/job.ts";
import { loadEatSoonTargets, runEatSoonJob } from "./eat-soon/job.ts";

const requestMs = 60_000;

function setting(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`eat_soon_setting_missing ${name}`);
    process.exit(2);
  }
  return value;
}

const siteUrl = process.env.SITE_URL?.trim().replace(/\/+$/, "");
if (!siteUrl) {
  console.info("eat_soon_skipped SITE_URL_not_set");
  process.exit(0);
}
// The members' tokens go to this address only: https, and never on to another one (no redirects, below).
let siteProtocol = "";
try {
  siteProtocol = new URL(siteUrl).protocol;
} catch {
  siteProtocol = "";
}
if (siteProtocol !== "https:") {
  console.error("eat_soon_setting_invalid SITE_URL_not_https");
  process.exit(2);
}
const url = setting("NEXT_PUBLIC_SUPABASE_URL");
const publishableKey = setting("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const admin: Db = createClient<Database>(url, setting("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const summary = await runEatSoonJob({
  listTargets: () => loadEatSoonTargets(admin),
  signIn: async (userId) => {
    const session = await signInAs(admin, { url, publishableKey }, userId);
    if (!session) return null;
    const held = await session.db.auth.getSession();
    const tokens = held.data.session;
    if (!tokens) throw new Error("eat_soon_no_session");
    return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, signOut: session.signOut };
  },
  notify: async (session) => {
    const response = await fetch(`${siteUrl}/api/eat-soon/notify`, {
      method: "POST",
      headers: { authorization: `Bearer ${session.accessToken}`, "x-refresh-token": session.refreshToken },
      signal: AbortSignal.timeout(requestMs),
      // A redirect would carry x-refresh-token to wherever it points: refuse it.
      redirect: "error",
    });
    if (!response.ok) throw new Error(`eat_soon_http_${response.status}`);
    const body = (await response.json()) as { data?: { outcome?: unknown; sent?: unknown; due?: unknown } };
    return {
      outcome: typeof body.data?.outcome === "string" ? body.data.outcome : "unavailable",
      due: typeof body.data?.due === "number" ? body.data.due : 0,
      sent: typeof body.data?.sent === "number" ? body.data.sent : 0,
    };
  },
  log: (event, fields) => console.info(event, JSON.stringify(fields)),
});
console.info("eat_soon_done", JSON.stringify(summary));

if (summary.households > 0 && summary.errors === summary.households) process.exitCode = 1;
