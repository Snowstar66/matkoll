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
/**
 * The E2E user of recipe-servings.spec.ts alone (the portion selector and "X
 * av Y hemma" in the recipe view, Story 4.1): each test makes its recipe,
 * catalog ingredients and pantry with the service role and empties its meal
 * plan, so what the view shows depends on nothing else.
 */
export const recipeViewEmail = "e2e-receptvy@matkoll.test";
/**
 * The E2E user of cook-mode.spec.ts alone (the step mode, Story 4.2): each
 * test makes its recipe, steps, catalog ingredients and pantry with the
 * service role, so what the step mode shows depends on nothing else.
 */
export const cookModeEmail = "e2e-steglage@matkoll.test";
/**
 * The E2E user of cookable.spec.ts alone (the filter Kan lagas nu, Story
 * 5.1): each test makes its recipes, catalog ingredients and pantry with the
 * service role, so the ranking depends on nothing else.
 */
export const cookableEmail = "e2e-kan-lagas@matkoll.test";
/**
 * The E2E user of ai-suggestions.spec.ts alone (AI-förslag, Story 5.2): each
 * test makes its recipe, catalog ingredients and pantry with the service
 * role, so what the mock is asked with and what a saved suggestion's status
 * is depend on nothing else.
 */
export const aiSuggestionsEmail = "e2e-ai-forslag@matkoll.test";
/**
 * The E2E user of pantry-camera.spec.ts alone (the camera on Hemma, Story
 * 6.1): each test makes its catalog ingredient and pantry with the service
 * role, so the suggestions the mock's answer gives depend on nothing else,
 * and the analysis can be shown to write nothing.
 */
export const cameraEmail = "e2e-bildanalys@matkoll.test";
/**
 * The E2E user of pantry-suggestions.spec.ts alone (confirming, correcting
 * and rejecting lagerförslag, Story 6.2): each test makes its catalog and
 * pantry with the service role, so what is saved can be checked row by row.
 */
export const suggestionsEmail = "e2e-lagerforslag@matkoll.test";
/**
 * The E2E user of empty-place.spec.ts alone ("Töm en plats", Story 6.3):
 * each test empties its pantry and makes its catalog and pantry with the
 * service role, so what is removed and put back can be checked row by row.
 */
export const emptyPlaceEmail = "e2e-tom-plats@matkoll.test";
/**
 * The E2E user of pantry-inventory.spec.ts alone ("Inventera en plats med
 * foto", Story 6.4): each test empties its pantry and makes its catalog and
 * pantry with the service role, so what a photo compares with, and what is
 * removed and put back, can be checked row by row.
 */
export const inventoryEmail = "e2e-inventering@matkoll.test";
/**
 * The E2E user of pantry-image-reading.spec.ts alone ("Bättre bildtolkning",
 * Story 6.5): each test empties its pantry with the service role, so the
 * photo of the fridge door is a plain list of labelled and unsure cards.
 */
export const imageReadingEmail = "e2e-bildtolkning@matkoll.test";
/**
 * The E2E user of store.spec.ts alone (Butik in Inställningar, Story 7.1):
 * each test sets its stores with the service role, so which store is
 * selected depends on nothing else.
 */
export const storeEmail = "e2e-butik@matkoll.test";
/**
 * The E2E user of product-choice.spec.ts alone (Produktval, Story 7.2): each
 * test sets its meal plan, own items, stores and product choices with the
 * service role, so what the detail shows depends on nothing else.
 */
export const productChoiceEmail = "e2e-produktval@matkoll.test";
/**
 * The E2E user of basket-export.spec.ts alone ("Skicka till ICA", Story
 * 7.3): each test sets its meal plan, own items, store and product choices
 * with the service role, so the copied export depends on nothing else.
 */
export const basketExportEmail = "e2e-varukorg@matkoll.test";
/**
 * The E2E user of pantry-sites.spec.ts alone (choosing and managing places
 * in Hemma, Story 8.2): each test sets its places and pantry with the
 * service role, so which place is selected depends on nothing else.
 */
export const sitesEmail = "e2e-stallen@matkoll.test";
/**
 * The E2E user of site-status.spec.ts alone (Story 8.3): each test sets its
 * places, pantry, recipe and meal plan with the service role, and selects
 * the place with it too.
 */
export const siteStatusEmail = "e2e-stalle-status@matkoll.test";
/**
 * The E2E user of site-list.spec.ts alone (Story 8.5, the list before a trip
 * to Stugan, with ketchup and senap): each test sets its places, pantry,
 * recipe, meal plan and store with the service role, with Hemma selected.
 */
export const siteListEmail = "e2e-stalle-lista@matkoll.test";
/**
 * The E2E user of site-photo.spec.ts alone (Story 8.4): each test sets its
 * places and pantry with the service role, with Hemma selected, so what a
 * photo is compared with and where it is saved depends on nothing else.
 */
export const sitePhotoEmail = "e2e-stalle-foto@matkoll.test";
/**
 * The E2E user of place-photo-save.spec.ts alone (Story 10.1): each test
 * seeds its places and catalog, and removes its photos (rows and files),
 * with the service role, so what is saved depends on nothing else.
 */
export const photoSaveEmail = "e2e-foto-spara@matkoll.test";
/**
 * The E2E user of core-flow.spec.ts alone (Story 3.8): it signs in itself
 * through /logga-in and the link in Mailpit, so it has no storage state.
 */
export const coreFlowEmail = "e2e-karna@matkoll.test";
/**
 * The E2E user of app-install.spec.ts alone (Matkoll på hemskärmen, Story
 * 11.6): it signs in with the code from the e-mail in Mailpit, and is made
 * again before each such test, so it has no storage state.
 */
export const appInstallEmail = "e2e-utseende-app@matkoll.test";
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
  recipeViewEmail,
  cookModeEmail,
  cookableEmail,
  aiSuggestionsEmail,
  cameraEmail,
  suggestionsEmail,
  emptyPlaceEmail,
  inventoryEmail,
  imageReadingEmail,
  storeEmail,
  productChoiceEmail,
  basketExportEmail,
  sitesEmail,
  siteStatusEmail,
  siteListEmail,
  sitePhotoEmail,
  photoSaveEmail,
  coreFlowEmail,
  appInstallEmail,
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
export const recipeViewStorageState = "tests/e2e/.auth/recipe-view.json";
export const cookModeStorageState = "tests/e2e/.auth/cook-mode.json";
export const cookableStorageState = "tests/e2e/.auth/cookable.json";
export const aiSuggestionsStorageState = "tests/e2e/.auth/ai-suggestions.json";
export const cameraStorageState = "tests/e2e/.auth/camera.json";
export const suggestionsStorageState = "tests/e2e/.auth/suggestions.json";
export const emptyPlaceStorageState = "tests/e2e/.auth/empty-place.json";
export const inventoryStorageState = "tests/e2e/.auth/inventory.json";
export const imageReadingStorageState = "tests/e2e/.auth/image-reading.json";
export const storeStorageState = "tests/e2e/.auth/store.json";
export const productChoiceStorageState = "tests/e2e/.auth/product-choice.json";
export const basketExportStorageState = "tests/e2e/.auth/basket-export.json";
export const sitesStorageState = "tests/e2e/.auth/sites.json";
export const siteStatusStorageState = "tests/e2e/.auth/site-status.json";
export const siteListStorageState = "tests/e2e/.auth/site-list.json";
export const sitePhotoStorageState = "tests/e2e/.auth/site-photo.json";
export const photoSaveStorageState = "tests/e2e/.auth/photo-save.json";
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
    // Story 10.1: no foreign key takes a user's photo files with the user.
    await removePlacePhotos(user.id);
    const deleted = await adminClient().auth.admin.deleteUser(user.id);
    if (deleted.error) throw deleted.error;
  }
}

/**
 * Deletes the E2E user `email` and creates it again, as users:sync does, and
 * returns the new id. Everything the user owned goes with it (on delete
 * cascade), and so does Auth's per-address limit on new magic links, so a
 * spec that signs in itself can run again at once, also on a retry. Only
 * against local Supabase, and only for an address in e2eEmails.
 */
export async function recreateE2eUser(email: (typeof e2eEmails)[number]): Promise<string> {
  localSupabaseUrl();
  const { data, error } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const existing = data.users.find((candidate) => candidate.email === email);
  if (existing) {
    const deleted = await adminClient().auth.admin.deleteUser(existing.id);
    if (deleted.error) throw deleted.error;
  }
  const created = await adminClient().auth.admin.createUser({ email, email_confirm: true });
  if (created.error) throw created.error;
  return created.data.user.id;
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

/**
 * The titles of suggestion cards as their headings read them (Story 6.6): the
 * title, and once the numbers on the photo have come, "Nummer 3 på fotot" for
 * screen readers after it.
 */
export function cardTitles(titles: readonly string[]): RegExp[] {
  return titles.map((title) => new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s?Nummer \\d+ på fotot)?$`));
}

/** The private bucket of the latest photo per place (Story 10.1, AD-26). */
export const placePhotoBucket = "pantry-photo";

/**
 * Removes every file of `userId` in the bucket pantry-photo
 * (`<user_id>/<site_id>/<location>/<photo>`), with the service role: no
 * foreign key takes them with a user or a place. Only against local Supabase.
 */
export async function removePlacePhotos(userId: string): Promise<void> {
  localSupabaseUrl();
  const bucket = adminClient().storage.from(placePhotoBucket);
  const sites = await bucket.list(userId);
  if (sites.error) throw sites.error;
  const paths: string[] = [];
  for (const site of sites.data) {
    for (const location of ["kyl", "frys", "skafferi"]) {
      const files = await bucket.list(`${userId}/${site.name}/${location}`);
      if (files.error) throw files.error;
      paths.push(...files.data.filter((file) => file.id !== null).map((file) => `${userId}/${site.name}/${location}/${file.name}`));
    }
  }
  if (paths.length === 0) return;
  const removed = await bucket.remove(paths);
  if (removed.error) throw removed.error;
}
