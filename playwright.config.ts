import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { e2eEmail } from "./tests/e2e/support";

// Supabase URL and keys come from .env.local (`pnpm db:env`); set variables win.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const port = 3100;
const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
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
    env: { AI_PROVIDER: "mock", ALLOWED_EMAILS: e2eEmail, SITE_URL: `http://localhost:${port}` },
  },
});
