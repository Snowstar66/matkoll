#!/usr/bin/env node
// Creates the Supabase Auth users listed in ALLOWED_EMAILS (AD-3). Sign-up is off,
// so this is the only way users are created. Users not in the list are reported
// and kept; `--prune` deletes them.
//
//   pnpm users:sync            create missing users, warn about others
//   pnpm users:sync --prune    also delete users not in ALLOWED_EMAILS
//
// `--prune` removes a user's photo files in the bucket pantry-photo first
// (Story 10.3, AD-26): the rows go with the user, the files do not. When they
// cannot be removed, the user is kept and the script stops with an error.
// Only counts are printed, never a path. A user deleted elsewhere (such as in
// the Supabase dashboard) leaves the files behind.
//
// Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and ALLOWED_EMAILS
// from the environment (`pnpm users:sync` loads .env.local). Uses the service
// role, which is allowed only in scripts/ and tests/ (AD-4).

import { createClient } from "@supabase/supabase-js";
import { removeUserPlacePhotos } from "./pantry-photo-files.mjs";
import { parseAllowedEmails, planUserSync, pruneUser } from "./users-sync-plan.mjs";

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

const plan = planUserSync(allowed, await listAllUsers(), { prune });

for (const email of plan.create) {
  const { error } = await supabase.auth.admin.createUser({ email, email_confirm: true });
  if (error) fail(`could not create ${email} (${error.code ?? error.status ?? "error"})`);
  console.log(`created  ${email}`);
}
for (const user of plan.keep) console.log(`exists   ${user.email}`);
for (const user of plan.extra) {
  if (prune) {
    const name = user.email ?? user.id;
    const result = await pruneUser(user, {
      removePhotos: (userId) => removeUserPlacePhotos(supabase.storage, userId),
      deleteUser: (userId) => supabase.auth.admin.deleteUser(userId),
    });
    if (!result.ok && result.step === "photos") {
      fail(`could not remove the photos of ${name} (${result.code}); the user is kept`);
    }
    if (!result.ok) fail(`could not delete ${name} (${result.code})`);
    console.log(`deleted  ${name} and ${result.removedPhotos} photo file(s)`);
  } else {
    console.warn(`warning: ${user.email ?? user.id} is not in ALLOWED_EMAILS (kept; --prune deletes it)`);
  }
}
