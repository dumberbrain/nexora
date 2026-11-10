import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { request as playwrightRequest } from "@playwright/test";

import { expect, test } from "./fixtures/axe";
import { S1, seedObservedSession } from "./support/us1-seed";

/*
 * T161 — axe sweep over every route, in both themes. Detail routes that need an execution or
 * workflow id are covered by the story specs (us2/us5); here the observed session and its
 * subagent from the recorded hook fixtures stand in for the dynamic routes.
 *
 * Screenshots: set NEXORA_SCREENSHOTS=1 to (re)write docs/screenshots/*.png from chromium.
 */
const ROUTES = [
  { path: "/", name: "dashboard" },
  { path: "/sessions", name: "sessions" },
  { path: `/sessions/${S1.sessionId}`, name: "session" },
  { path: "/canvas", name: "canvas" },
  { path: `/agents/${S1.subagentId}`, name: "agent" },
  { path: "/tasks", name: "board" },
  { path: "/executions/new", name: "new-execution" },
  { path: "/workflows", name: "workflows" },
  { path: "/communication", name: "communication" },
  { path: "/logs", name: "logs" },
  { path: "/integrations", name: "integrations" },
  { path: "/github", name: "github" },
  { path: "/settings", name: "settings" },
] as const;

const THEMES = ["dark", "light"] as const;
const SCREENSHOT_DIR = fileURLToPath(new URL("../docs/screenshots/", import.meta.url));

let cleanup: (() => void) | undefined;

test.beforeAll(async ({ baseURL }) => {
  const api = await playwrightRequest.newContext({ baseURL: baseURL! });
  ({ cleanup } = await seedObservedSession(api));
  await api.dispose();
});

test.afterAll(() => cleanup?.());

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((pref) => {
        localStorage.setItem("nexora-theme:v1", JSON.stringify({ state: { pref }, version: 1 }));
      }, theme);
    });

    for (const route of ROUTES) {
      test(`${route.name} has no axe violations`, async ({
        page,
        browserName,
        expectNoA11yViolations,
      }) => {
        await page.goto(route.path);
        await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
        // first paint of a lazy route chunk can exceed 5 s while 26 tests share one server
        await expect(page.getByRole("main")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole("status", { name: /realtime connected/i })).toBeVisible();
        await expectNoA11yViolations();

        if (process.env.NEXORA_SCREENSHOTS === "1" && browserName === "chromium") {
          mkdirSync(SCREENSHOT_DIR, { recursive: true });
          await page.screenshot({ path: `${SCREENSHOT_DIR}${route.name}-${theme}.png` });
        }
      });
    }
  });
}
