#!/usr/bin/env node
// Creates the Supabase Auth users listed in ALLOWED_EMAILS (AD-3). Sign-up is off,
// so this is the only way users are created. Users not in the list are reported
// and kept; `--prune` deletes them.
//
//   pnpm users:sync            create missing users, warn about others
//   pnpm users:sync --prune    also delete users not in ALLOWED_EMAILS
//
// `--prune` bans a user, removes its photo files in the bucket pantry-photo,
// deletes it and removes what is left (Story 10.3, AD-26, pruneExtraUsers):
// the rows go with the user, the files do not. When the files cannot be
// removed, the user is kept (banned); a failure for one user does not stop
// the others, and the script ends with an error. Every run, with or without
// `--prune`, also removes the files of users that no longer exist, such as a
// user deleted in the Supabase dashboard (removeDeletedUsersFiles): the app's
// sweep runs as a signed-in user and never reaches another user's folder.
// Only user ids and counts are printed for photos, never a path.
//
// Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and ALLOWED_EMAILS
// from the environment (`pnpm users:sync` loads .env.local). Uses the service
// role, which is allowed only in scripts/ and tests/ (AD-4).

import { createClient } from "@supabase/supabase-js";
import { householdMembersLetIn, parseAllowedEmails, planUserSync, pruneExtraUsers, removeDeletedUsersFiles } from "./users-sync-plan.mjs";

const prune = process.argv.slice(2).includes("--prune");

function fail(message) {
  console.error(`users:sync: ${message}`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  fail("set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (run `pnpm db:env` for local Supabase)");
}

let allowed;
try {
  allowed = parseAllowedEmails(process.env.ALLOWED_EMAILS);
} catch (error) {
  fail(error instanceof Error ? error.message : "invalid ALLOWED_EMAILS");
}
if (allowed.length === 0) fail("ALLOWED_EMAILS is empty; nothing to sync");

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function listAllUsers() {
  const users = [];
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) fail(`could not list users (${error.code ?? error.status ?? "error"})`);
    users.push(...data.users.map(({ id, email }) => ({ id, email })));
    if (data.users.length < perPage) return users;
  }
}

// Story 21.2b: the members of a household with someone on the list (invited) are kept.
const existing = await listAllUsers();
const { data: memberships, error: membershipsError } = await supabase.from("household_member").select("household_id, user_id");
if (membershipsError) fail(`could not list household members (${membershipsError.code ?? "error"})`);
const plan = planUserSync(allowed, existing, { prune, members: householdMembersLetIn(allowed, existing, memberships) });

for (const email of plan.create) {
  const { error } = await supabase.auth.admin.createUser({ email, email_confirm: true });
  if (error) fail(`could not create ${email} (${error.code ?? error.status ?? "error"})`);
  console.log(`created  ${email}`);
}
for (const user of plan.keep) console.log(`exists   ${user.email}`);
for (const user of plan.household) console.log(`member   ${user.email ?? user.id} (invited to a household)`);
if (!prune) {
  for (const user of plan.extra) {
    console.warn(`warning: ${user.email ?? user.id} is not in ALLOWED_EMAILS (kept; --prune deletes it)`);
  }
}

function print({ lines, ok }) {
  for (const { level, text } of lines) {
    if (level === "error") console.error(`users:sync: ${text}`);
    else console.log(text);
  }
  return ok;
}

const pruned = prune ? print(await pruneExtraUsers(plan, supabase)) : true;
const swept = print(await removeDeletedUsersFiles(supabase));
if (!pruned || !swept) process.exit(1);
