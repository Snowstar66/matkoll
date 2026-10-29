#!/usr/bin/env node
// Story 15.1: sets the password of an existing LOCAL Supabase user, so that the
// automatic local sign-in works. Reads DEV_AUTO_LOGIN_EMAIL, DEV_AUTO_LOGIN_PASSWORD,
// NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment
// (`pnpm dev:set-password` loads .env.local). Refuses unless the Supabase URL is
// localhost or 127.0.0.1. Uses the service role, allowed only in scripts/ (AD-4).
// Prints no e-mail and no password.

import { createClient } from "@supabase/supabase-js";

function fail(message) {
  console.error(`dev:set-password: ${message}`);
  process.exit(1);
}

const {
  DEV_AUTO_LOGIN_EMAIL: email,
  DEV_AUTO_LOGIN_PASSWORD: password,
  NEXT_PUBLIC_SUPABASE_URL: url,
  SUPABASE_SERVICE_ROLE_KEY: serviceKey,
} = process.env;

if (!url || !serviceKey) fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
if (!email?.trim() || !password) fail("DEV_AUTO_LOGIN_EMAIL and DEV_AUTO_LOGIN_PASSWORD must be set.");

let hostname;
try {
  hostname = new URL(url).hostname;
} catch {
  fail("NEXT_PUBLIC_SUPABASE_URL is not a URL.");
}
if (hostname !== "127.0.0.1" && hostname !== "localhost") {
  fail("refusing to run: the Supabase URL is not local.");
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const wanted = email.trim().toLowerCase();

let user;
for (let page = 1; !user; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
  if (error) fail("could not list users.");
  user = data.users.find((candidate) => candidate.email?.toLowerCase() === wanted);
  if (data.users.length < 200) break;
}
if (!user) fail("no local user has that e-mail. Run `pnpm users:sync` first.");

const { error } = await supabase.auth.admin.updateUserById(user.id, { password });
if (error) fail(`could not set the password (${error.status ?? "error"}).`);
console.log("dev:set-password: password set for the local user.");
