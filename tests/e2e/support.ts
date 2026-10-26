import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { localSupabaseUrl } from "../local-supabase";

// Shared by global-setup and the specs. The service role is allowed in tests (AD-4).

/**
 * The E2E user whose library stays empty: the specs that expect "Inga recept
 * än." (auth, shell, import) use it, and nothing saves a recipe for it.
 */
export const e2eEmail = "e2e@matkoll.test";
/**
 * The E2E user that saves recipes (recipe.spec.ts, saving in import.spec.ts),
 * in parallel: its catalog grows during a run, so those specs never assume an
 * ingredient is new (see recipe.spec.ts).
 */
export const recipesEmail = "e2e-recept@matkoll.test";
/** The E2E user of library.spec.ts alone, so its list holds only what it saves. */
export const libraryEmail = "e2e-bibliotek@matkoll.test";
/**
 * The E2E user of settings.spec.ts alone: it turns recipe sites off and signs
 * out, which must not reach the other specs' users.
 */
export const settingsEmail = "e2e-installningar@matkoll.test";
/**
 * The E2E user of pantry.spec.ts alone: its pantry rows are made with the
 * service role before the tests, and no other spec may add any.
 */
export const pantryEmail = "e2e-hemma@matkoll.test";
/**
 * The E2E user of pantry-status.spec.ts alone: it saves a recipe and fills
 * its pantry, so the status it expects depends on nothing else.
 */
export const statusEmail = "e2e-status@matkoll.test";
/**
 * The E2E user of mealplan.spec.ts alone: its recipes, catalog ingredients
 * and pantry are made with the service role before the tests, and its meal
 * plan is emptied, so what the plan shows depends on nothing else.
 */
export const mealplanEmail = "e2e-matsedel@matkoll.test";
/**
 * The E2E user of the shopping list (shopping.spec.ts, and the specs of
 * Stories 3.4–3.6, which run in order with it): its recipes, catalog
 * ingredients, meal plan and pantry are made with the service role, so the
 * list depends on nothing else.
 */
export const shoppingEmail = "e2e-lista@matkoll.test";
/**
 * The E2E user of put-in-pantry.spec.ts alone ("Lägg i lagret", Story 3.7):
 * each test makes its recipe, meal plan, own items and pantry with the
 * service role, so what goes to the pantry depends on nothing else.
 */
export const putInPantryEmail = "e2e-lagg-i-lagret@matkoll.test";
/** Every address in ALLOWED_EMAILS for the E2E server (see playwright.config.ts). */
export const e2eEmails = [
  e2eEmail,
  recipesEmail,
  libraryEmail,
  settingsEmail,
  pantryEmail,
  statusEmail,
  mealplanEmail,
  shoppingEmail,
  putInPantryEmail,
] as const;
/** A real Supabase user whose address is not in ALLOWED_EMAILS. */
export const outsiderEmail = "utanfor@matkoll.test";

export const userStorageState = "tests/e2e/.auth/user.json";
export const recipesStorageState = "tests/e2e/.auth/recipes.json";
export const libraryStorageState = "tests/e2e/.auth/library.json";
export const settingsStorageState = "tests/e2e/.auth/settings.json";
export const pantryStorageState = "tests/e2e/.auth/pantry.json";
export const statusStorageState = "tests/e2e/.auth/status.json";
export const mealplanStorageState = "tests/e2e/.auth/mealplan.json";
export const shoppingStorageState = "tests/e2e/.auth/shopping.json";
export const putInPantryStorageState = "tests/e2e/.auth/put-in-pantry.json";
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
 * Deletes the E2E users, if there are any, so each run starts with no recipes,
 * steps, lines, synonyms or catalog ingredients for them: they all go with
 * the user (on delete cascade). The service role may not delete catalog
 * ingredients on its own (AD-20), so removing the user is the way to empty
 * the catalog. Only against local Supabase; global-setup creates the users
 * again with users:sync.
 */
export async function deleteE2eUsers(): Promise<void> {
  localSupabaseUrl();
  const { data, error } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const emails = new Set<string>(e2eEmails);
  for (const user of data.users.filter((candidate) => candidate.email && emails.has(candidate.email))) {
    const deleted = await adminClient().auth.admin.deleteUser(user.id);
    if (deleted.error) throw deleted.error;
  }
}

/** The id of an E2E user; global-setup has created it. */
export async function e2eUserId(email: string): Promise<string> {
  const { data, error } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((candidate) => candidate.email === email);
  if (!user) throw new Error(`${email} is missing; global-setup creates it`);
  return user.id;
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
