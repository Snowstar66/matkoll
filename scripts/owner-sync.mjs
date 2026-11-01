#!/usr/bin/env node
// Makes OWNER_EMAIL's user the app's owner (Story 20.3): looks the address up
// in Supabase Auth and writes that user's id to the table app_owner, which is
// what is_app_owner() reads, so that user alone sees Inkorg under Inställningar
// and can read what is sent from Hjälp > Tyck till. Ownership is bound to the
// user id, never to the address, so a user who later takes the address does
// not become the owner. The database cannot read the app's environment, so
// this is the step that carries OWNER_EMAIL over. Any other user in app_owner
// is removed, so there is exactly one owner afterwards. Refuses when no user
// has the address (run `pnpm users:sync` first). Run it again after the owner
// changes, or after the owner's account is made anew (a new id).
//
//   pnpm owner:sync
//
// Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and OWNER_EMAIL
// from the environment (`pnpm owner:sync` loads .env.local). Against local
// Supabase without OWNER_EMAIL, the owner is DEV_AUTO_LOGIN_EMAIL: on your own
// machine you are the owner. Uses the service role, which is allowed only in
// scripts/ and tests/ (AD-4). Prints only the owner's address and how many
// others were removed.

import { createClient } from "@supabase/supabase-js";
import { ownerFrom, ownerUserId, planOwnerSync } from "./owner-sync-plan.mjs";

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

async function listAllUsers() {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail(`could not list users (${error.code ?? error.status ?? "error"})`);
    users.push(...data.users.map(({ id, email }) => ({ id, email })));
    if (data.users.length < 1000) return users;
  }
}

const ownerId = ownerUserId(owner, await listAllUsers());
if (!ownerId) fail("no user has that address yet; run `pnpm users:sync` first");

const current = await supabase.from("app_owner").select("user_id");
if (current.error) fail(`could not read app_owner (${current.error.code ?? "error"}); is the migration applied?`);

const plan = planOwnerSync(ownerId, current.data.map((row) => row.user_id));
if (plan.add) {
  const { error } = await supabase.from("app_owner").insert({ user_id: ownerId });
  if (error) fail(`could not add the owner (${error.code ?? "error"})`);
}
if (plan.remove.length > 0) {
  const { error } = await supabase.from("app_owner").delete().in("user_id", plan.remove);
  if (error) fail(`could not remove the other owners (${error.code ?? "error"})`);
}

console.log(`owner    ${owner}${plan.add ? " (added)" : " (already)"}${from === "OWNER_EMAIL" ? "" : `, from ${from}`}`);
if (plan.remove.length > 0) console.log(`removed  ${plan.remove.length} other user(s)`);
