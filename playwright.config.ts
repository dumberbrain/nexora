import { defineConfig, devices } from "@playwright/test";

/** Defaults to 3022; override (UBULIERA_E2E_PORT) when a dev server already owns that port. */
const PORT = Number(process.env.UBULIERA_E2E_PORT ?? 3022);

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  // Production build under test, never the dev server. start:e2e = NODE_ENV=test + fake runtime.
  webServer: {
    command: "npm run build && npm run start:e2e",
    url: `http://localhost:${PORT}/api/v1/health`,
    env: { UBULIERA_PORT: String(PORT), UBULIERA_PUBLIC_URL: `http://127.0.0.1:${PORT}` },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
