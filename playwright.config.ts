import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests/e2e",
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
    url: `http://localhost:${port}`,
    reuseExistingServer: !isCi,
    timeout: 120_000,
    env: { AI_PROVIDER: "mock" },
  },
});
