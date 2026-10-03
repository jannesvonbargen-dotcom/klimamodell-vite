import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke-Tests im echten Browser. Startet einen eigenen Server auf Port 3100
 * mit separater Datenbank (data/e2e.db) und Demo-Kursen – die eigenen Daten
 * bleiben unberührt.
 *
 *   npx playwright install chromium   # einmalig
 *   npm run test:e2e
 *
 * Mit PLAYWRIGHT_CHROMIUM_EXECUTABLE lässt sich ein vorhandenes Chromium nutzen.
 */
const PORT = 3100;
const env = {
  DATABASE_PATH: "data/e2e.db",
  MARKET_DATA_PROVIDER: "mock",
  FX_PROVIDER: "mock",
  NEXT_DIST_DIR: ".next-e2e",
  NEXT_TELEMETRY_DISABLED: "1",
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 900 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobil", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `npx tsx scripts/reset.ts --no-backup && npx next dev -H 127.0.0.1 -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    env,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
  },
});
