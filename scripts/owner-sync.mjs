#!/usr/bin/env node
// Makes OWNER_EMAIL the app's owner (Story 20.3): writes it to the table
// app_owner, which is what is_app_owner() reads, so that address alone sees
// Inkorg under Inställningar and can read what is sent from Hjälp > Tyck till.
// The database cannot read the app's environment, so this is the step that
// carries OWNER_EMAIL over. Any other address in app_owner is removed, so there
// is exactly one owner afterwards. Run it again after changing OWNER_EMAIL.
//
//   pnpm owner:sync
//
// Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and OWNER_EMAIL
// from the environment (`pnpm owner:sync` loads .env.local). Against local
// Supabase without OWNER_EMAIL, the owner is DEV_AUTO_LOGIN_EMAIL: on your own
// machine you are the owner. Uses the service
// role, which is allowed only in scripts/ and tests/ (AD-4). Prints only the
// owner's address and how many others were removed.

import { createClient } from "@supabase/supabase-js";
import { ownerFrom, planOwnerSync } from "./owner-sync-plan.mjs";

function fail(message) {
  console.error(`owner:sync: ${message}`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  fail("set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (run `pnpm db:env` for local Supabase)");
}

let owner;
let from;
try {
  ({ email: owner, from } = ownerFrom(process.env, url));
} catch (error) {
  fail(error instanceof Error ? error.message : "invalid OWNER_EMAIL");
}

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

// The owner must already have an account. An address nobody holds could be taken by any
// signed-in user who changes their own address to it (e-mail confirmation is off), and
// is_app_owner() would then answer yes for them.
async function hasUser(email) {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail(`could not list users (${error.code ?? error.status ?? "error"})`);
    if (data.users.some((user) => (user.email ?? "").toLowerCase() === email)) return true;
    if (data.users.length < 1000) return false;
  }
}
if (!(await hasUser(owner))) fail("no user has that address yet; run `pnpm users:sync` first");

const current = await supabase.from("app_owner").select("email");
if (current.error) fail(`could not read app_owner (${current.error.code ?? "error"}); is the migration applied?`);

const plan = planOwnerSync(owner, current.data.map((row) => row.email));
if (plan.add) {
  const { error } = await supabase.from("app_owner").insert({ email: owner });
  if (error) fail(`could not add the owner (${error.code ?? "error"})`);
}
if (plan.remove.length > 0) {
  const { error } = await supabase.from("app_owner").delete().in("email", plan.remove);
  if (error) fail(`could not remove the other owners (${error.code ?? "error"})`);
}

console.log(`owner    ${owner}${plan.add ? " (added)" : " (already)"}${from === "OWNER_EMAIL" ? "" : `, from ${from}`}`);
if (plan.remove.length > 0) console.log(`removed  ${plan.remove.length} other address(es)`);
