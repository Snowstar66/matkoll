#!/usr/bin/env node
// Story 17.11: fetches the week's offers for every store with a link, once.
// Run by .github/workflows/offers.yml every morning and Sunday evening (by hand: Actions →
// Offers → Run workflow, docs/molnet.md steg 8). `pnpm offers:fetch` never reads
// .env.local: it touches every user's stores and fetches the real pages, so the
// settings below must be set on purpose. The work is in scripts/fetch-offers/job.ts;
// this file only connects it to the world.
//
// Settings come from the environment, never from a file in git, and are never printed:
//   NEXT_PUBLIC_SUPABASE_URL               the project's URL
//   SUPABASE_SERVICE_ROLE_KEY              the secret key: lists the stores and signs in as their owners
//   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY   the publishable key: the owners' sessions use it, as the app does
// Exit code 1 when a page was refused or failed, so the run turns red and GitHub mails.

import { createClient } from "@supabase/supabase-js";
import { matchIngredientsIn } from "@/features/catalog/actions/match-ingredients";
import { loadIngredientSummaries } from "@/features/catalog/data/queries";
import { OFFER_SITE_DOMAINS } from "@/features/settings";
import type { Database } from "@/lib/supabase/database.types";
import { fetchOfferPageWith } from "@/server/fetch/offer-page";
import { loadStoreRows, runOffersJob, signInAs, type Db } from "./fetch-offers/job.ts";

/** The pause between two pages: one store's site at a time, politely. */
const pauseMs = 3_000;

function setting(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`offers_job_setting_missing ${name}`);
    process.exit(2);
  }
  return value;
}

const url = setting("NEXT_PUBLIC_SUPABASE_URL");
const publishableKey = setting("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const admin: Db = createClient<Database>(url, setting("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const summary = await runOffersJob({
  listStores: () => loadStoreRows(admin),
  signIn: (userId) => signInAs(admin, { url, publishableKey }, userId),
  fetchPage: (pageUrl) =>
    fetchOfferPageWith(pageUrl, { allowedDomains: OFFER_SITE_DOMAINS, signal: new AbortController().signal }),
  catalogFor: (db) => ({
    match: (items) => matchIngredientsIn(db, items),
    summaries: (ids) => loadIngredientSummaries(db, ids),
  }),
  now: () => new Date(),
  pause: () => new Promise((resolve) => setTimeout(resolve, pauseMs)),
  log: (event, fields) => console.info(event, JSON.stringify(fields)),
});

if (summary.blocked > 0 || summary.failed > 0) process.exitCode = 1;
