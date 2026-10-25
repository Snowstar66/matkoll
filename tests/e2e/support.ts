import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { localSupabaseUrl } from "../local-supabase";

// Shared by global-setup and the specs. The service role is allowed in tests (AD-4).

/** The only address in ALLOWED_EMAILS for the E2E server (see playwright.config.ts). */
export const e2eEmail = "e2e@matkoll.test";
/** A real Supabase user whose address is not in ALLOWED_EMAILS. */
export const outsiderEmail = "utanfor@matkoll.test";

export const userStorageState = "tests/e2e/.auth/user.json";
export const outsiderStorageState = "tests/e2e/.auth/outsider.json";

export const mailpitUrl = "http://127.0.0.1:54324";

let admin: SupabaseClient | undefined;

export function adminClient(): SupabaseClient {
  const url = localSupabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("Set SUPABASE_SERVICE_ROLE_KEY (pnpm db:env)");
  }
  admin ??= createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return admin;
}

/**
 * Deletes the E2E user, if there is one, so each run starts with no recipes,
 * steps, lines, synonyms or catalog ingredients for it: they all go with the
 * user (on delete cascade). The service role may not delete catalog
 * ingredients on its own (AD-20), so removing the user is the way to empty
 * the catalog. Only against local Supabase; global-setup creates the user
 * again with users:sync.
 */
export async function deleteE2eUser(): Promise<void> {
  localSupabaseUrl();
  const { data, error } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((candidate) => candidate.email === e2eEmail);
  if (!user) return;
  const deleted = await adminClient().auth.admin.deleteUser(user.id);
  if (deleted.error) throw deleted.error;
}

/**
 * A fresh magic link for `email`, pointing at the app's real /auth/confirm, the
 * same URL the e-mail template builds. No test route in the app is involved.
 */
export async function magicLinkPath(email: string, next = "/recept"): Promise<string> {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const params = new URLSearchParams({ token_hash: data.properties.hashed_token, type: "email", next });
  return `/auth/confirm?${params}`;
}

/**
 * Session cookies for `email`, made the way the app's /auth/confirm makes them
 * but outside the app. Used for a session the app itself would not keep: one
 * for an address that is not in ALLOWED_EMAILS.
 */
export async function sessionCookiesFor(email: string): Promise<{ name: string; value: string }[]> {
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!publishableKey) throw new Error("Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (pnpm db:env)");
  const { data, error } = await adminClient().auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;

  const jar = new Map<string, string>();
  const client = createServerClient(localSupabaseUrl(), publishableKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value } of cookies) {
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
      },
    },
  });
  const verified = await client.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "email" });
  if (verified.error) throw verified.error;
  return [...jar].map(([name, value]) => ({ name, value }));
}

type MailpitMessage = { ID: string; To: { Address: string }[] };

/** Messages in Mailpit sent to `email`. */
export async function mailsTo(email: string): Promise<MailpitMessage[]> {
  const response = await fetch(`${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
  if (!response.ok) throw new Error(`Mailpit answered ${response.status}`);
  const body = (await response.json()) as { messages: MailpitMessage[] };
  return body.messages;
}

export async function deleteMailsTo(email: string): Promise<void> {
  await fetch(`${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`, { method: "DELETE" });
}

export async function mailHtml(id: string): Promise<string> {
  const response = await fetch(`${mailpitUrl}/api/v1/message/${id}`);
  if (!response.ok) throw new Error(`Mailpit answered ${response.status} for message ${id}`);
  const body = (await response.json()) as { HTML: string };
  return body.HTML;
}
