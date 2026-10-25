import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localSupabaseUrl } from "../local-supabase";

// Sign-up is closed and users come only from `pnpm users:sync` (AD-3), checked
// against local Supabase. Every address is unique to this run and removed afterwards.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const address = (name: string) => `${name}-${run}@matkoll.test`;

let admin: SupabaseClient;
let anon: SupabaseClient;
const createdIds = new Set<string>();

async function usersWithEmail(email: string) {
  const matches = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    matches.push(...data.users.filter((user) => user.email === email));
    if (data.users.length < 1000) return matches;
  }
}

function usersSync(allowedEmails: string, ...args: string[]) {
  return execFileSync(process.execPath, ["scripts/users-sync.mjs", ...args], {
    cwd: root,
    env: { ...process.env, ALLOWED_EMAILS: allowedEmails },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

beforeAll(() => {
  localSupabaseUrl(url);
  if (!url || !publishableKey || !serviceKey) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY (pnpm db:start && pnpm db:env)",
    );
  }
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  admin = createClient(url, serviceKey, options);
  anon = createClient(url, publishableKey, options);
});

afterAll(async () => {
  for (const name of ["allowed-a", "allowed-b", "outsider", "signup", "otp"]) {
    for (const user of await usersWithEmail(address(name))) createdIds.add(user.id);
  }
  for (const id of createdIds) await admin.auth.admin.deleteUser(id);
});

describe("sign-up is closed", () => {
  it("rejects auth.signUp with the publishable key and creates no user", async () => {
    const email = address("signup");
    const { data, error } = await anon.auth.signUp({ email, password: `pw-${run}-long-enough` });
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
    expect(await usersWithEmail(email)).toHaveLength(0);
  });

  it("does not create a user from signInWithOtp with shouldCreateUser: false", async () => {
    const email = address("otp");
    const { error } = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    expect(error).not.toBeNull();
    expect(await usersWithEmail(email)).toHaveLength(0);
  });
});

describe("pnpm users:sync", () => {
  it("creates exactly the allowed users, once, and deletes nothing", async () => {
    const outsider = address("outsider");
    const created = await admin.auth.admin.createUser({ email: outsider, email_confirm: true });
    expect(created.error).toBeNull();
    createdIds.add(created.data.user!.id);

    const allowed = [address("allowed-a"), address("allowed-b")];
    // Mixed case and spacing, as a hand-written ALLOWED_EMAILS might have.
    const list = ` ${allowed[0].toUpperCase()}, ${allowed[1]} `;

    const first = usersSync(list);
    expect(first).toContain(`created  ${allowed[0]}`);
    expect(first).toContain(`created  ${allowed[1]}`);

    const second = usersSync(list);
    expect(second).not.toContain("created");

    for (const email of allowed) {
      const users = await usersWithEmail(email);
      expect(users).toHaveLength(1);
      expect(users[0].email_confirmed_at).toBeTruthy();
    }
    expect(await usersWithEmail(outsider)).toHaveLength(1);
  });

  it("lets a synced user ask for a magic link", async () => {
    const email = address("allowed-a");
    usersSync(email);
    const { error } = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    expect(error).toBeNull();
  });

  it("refuses to run with an empty ALLOWED_EMAILS", () => {
    expect(() => usersSync("")).toThrow();
  });
});
