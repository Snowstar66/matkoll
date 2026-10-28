import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium, type FullConfig } from "@playwright/test";
import { localSupabaseUrl } from "../local-supabase";
import {
  adminClient,
  aiSuggestionsEmail,
  aiSuggestionsStorageState,
  aiImportEmail,
  aiImportStorageState,
  aiStreamEmail,
  aiStreamStorageState,
  aiJobsEmail,
  aiJobsStorageState,
  aiPhotoEmail,
  aiPhotoStorageState,
  aiWarmEmail,
  aiWarmStorageState,
  basketExportEmail,
  basketExportStorageState,
  cameraEmail,
  cameraStorageState,
  cookableEmail,
  cookableStorageState,
  cookModeEmail,
  cookModeStorageState,
  deleteE2eUsers,
  e2eEmail,
  e2eEmails,
  emptyPlaceEmail,
  emptyPlaceStorageState,
  imageReadingEmail,
  imageReadingStorageState,
  inventoryEmail,
  inventoryStorageState,
  libraryEmail,
  libraryStorageState,
  magicLinkPath,
  openMagicLink,
  mealplanEmail,
  mealplanStorageState,
  outsiderEmail,
  outsiderStorageState,
  pantryEmail,
  pantryStorageState,
  photoSaveEmail,
  photoSaveStorageState,
  labelEmail,
  labelStorageState,
  pantryLookEmail,
  pantryLookStorageState,
  photoSweepEmail,
  photoSweepStorageState,
  photoViewEmail,
  photoViewStorageState,
  productChoiceEmail,
  productChoiceStorageState,
  putInPantryEmail,
  putInPantryStorageState,
  recipesEmail,
  recipesLookEmail,
  recipesLookStorageState,
  recipesStorageState,
  recipeViewEmail,
  recipeViewStorageState,
  sessionCookiesFor,
  settingsEmail,
  settingsStorageState,
  shoppingEmail,
  shoppingLookEmail,
  shoppingLookStorageState,
  shoppingStorageState,
  siteListEmail,
  siteListStorageState,
  sitesEmail,
  sitesStorageState,
  siteStatusEmail,
  siteStatusStorageState,
  sitePhotoEmail,
  sitePhotoStorageState,
  statusEmail,
  statusStorageState,
  storeEmail,
  storeStorageState,
  suggestionsEmail,
  suggestionsStorageState,
  userStorageState,
} from "./support";

// Creates the test users and saves a session for each (AD-3). The E2E users sign
// in through the app's real /auth/confirm with a token from auth.admin.generateLink.
export default async function globalSetup(config: FullConfig) {
  // Users are created and deleted below: only ever against local Supabase.
  localSupabaseUrl();
  const baseURL = config.projects[0].use.baseURL;
  if (!baseURL) throw new Error("playwright.config.ts must set use.baseURL");

  // Every run starts with empty E2E users: earlier runs' recipes and catalog
  // would otherwise make the specs depend on each other.
  await deleteE2eUsers();

  // The E2E users come from users:sync, like Pontus does.
  execFileSync(process.execPath, ["scripts/users-sync.mjs"], {
    env: { ...process.env, ALLOWED_EMAILS: e2eEmails.join(",") },
    stdio: ["ignore", "ignore", "inherit"],
  });

  // A user who exists in Supabase but is not in ALLOWED_EMAILS.
  const { error } = await adminClient().auth.admin.createUser({ email: outsiderEmail, email_confirm: true });
  if (error && error.code !== "email_exists") throw error;

  // Every E2E user but coreFlowEmail and appInstallEmail gets a saved session:
  // core-flow.spec.ts and app-install.spec.ts sign in through /logga-in and
  // Mailpit themselves.
  mkdirSync("tests/e2e/.auth", { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const [email, path] of [
      [e2eEmail, userStorageState],
      [recipesEmail, recipesStorageState],
      [libraryEmail, libraryStorageState],
      [settingsEmail, settingsStorageState],
      [pantryEmail, pantryStorageState],
      [statusEmail, statusStorageState],
      [mealplanEmail, mealplanStorageState],
      [shoppingEmail, shoppingStorageState],
      [putInPantryEmail, putInPantryStorageState],
      [recipeViewEmail, recipeViewStorageState],
      [cookModeEmail, cookModeStorageState],
      [cookableEmail, cookableStorageState],
      [aiSuggestionsEmail, aiSuggestionsStorageState],
      [cameraEmail, cameraStorageState],
      [suggestionsEmail, suggestionsStorageState],
      [emptyPlaceEmail, emptyPlaceStorageState],
      [inventoryEmail, inventoryStorageState],
      [imageReadingEmail, imageReadingStorageState],
      [storeEmail, storeStorageState],
      [productChoiceEmail, productChoiceStorageState],
      [basketExportEmail, basketExportStorageState],
      [sitesEmail, sitesStorageState],
      [siteStatusEmail, siteStatusStorageState],
      [siteListEmail, siteListStorageState],
      [sitePhotoEmail, sitePhotoStorageState],
      [photoSaveEmail, photoSaveStorageState],
      [labelEmail, labelStorageState],
      [recipesLookEmail, recipesLookStorageState],
      [shoppingLookEmail, shoppingLookStorageState],
      [pantryLookEmail, pantryLookStorageState],
      [photoSweepEmail, photoSweepStorageState],
      [photoViewEmail, photoViewStorageState],
      [aiWarmEmail, aiWarmStorageState],
      [aiJobsEmail, aiJobsStorageState],
      [aiPhotoEmail, aiPhotoStorageState],
      [aiImportEmail, aiImportStorageState],
      [aiStreamEmail, aiStreamStorageState],
    ] as const) {
      const user = await browser.newContext({ baseURL });
      const page = await user.newPage();
      await openMagicLink(page, await magicLinkPath(email, "/recept"));
      await page.waitForURL(/\/recept$/);
      await user.storageState({ path });
      await user.close();
    }

    // /auth/confirm refuses to keep a session for the outsider, so it is made
    // outside the app, as if the address had been removed from ALLOWED_EMAILS
    // after signing in.
    const outsider = await browser.newContext({ baseURL });
    const cookies = await sessionCookiesFor(outsiderEmail);
    await outsider.addCookies(cookies.map((cookie) => ({ ...cookie, url: baseURL })));
    await outsider.storageState({ path: outsiderStorageState });
    await outsider.close();
  } finally {
    await browser.close();
  }
}
