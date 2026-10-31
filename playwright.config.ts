import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { e2eEmails } from "./tests/e2e/support";

// Supabase URL and keys come from .env.local (`pnpm db:env`); set variables win.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const port = 3100;
const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  // A recipe import is an AI job (Story 12.6): the mock's 3 s and the page's polling every 2 s come before the draft.
  expect: { timeout: 15_000 },
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: isCi ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    locale: "sv-SE",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // CI runs `pnpm build` first and tests the production server; locally the dev server is enough.
    command: isCi ? `pnpm start --port ${port}` : `pnpm dev --port ${port}`,
    url: `http://localhost:${port}/logga-in`,
    reuseExistingServer: !isCi,
    timeout: 120_000,
    // SITE_URL builds the link in the e-mail, so it must be this server. AI_PROVIDER must be
    // explicit, since `next start` runs in production mode (the mock is never a silent default there).
    // Stories 12.4 and 12.6: AI_MOCK_DELAY_MS makes an AI-förslag call and a recipe import take 3 s (only
    // the mock reads it), so the queue and the job row can be seen; the other AI calls answer at once.
    env: {
      AI_PROVIDER: "mock",
      AI_MOCK_DELAY_MS: "3000",
      ALLOWED_EMAILS: e2eEmails.join(","),
      // Story 17.5: the AI section shows outside development only for these addresses.
      AI_SETTINGS_EMAILS: e2eEmails.join(","),
      SITE_URL: `http://localhost:${port}`,
    },
  },
});
