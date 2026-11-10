import { type Locator, type Page, request as playwrightRequest } from "@playwright/test";

import { expect, test } from "./fixtures/axe";
import { S1, seedObservedSession } from "./support/us1-seed";

// SC-007 — key UI interactions complete within 1 s. Measured from the user action (click) to the
// target view's heading being visible; the first full page load is a warm-up and not measured.
// locator.waitFor is used instead of expect().toBeVisible() because expect polls on a coarse
// back-off schedule that would inflate the measured time.
test.describe.configure({ mode: "serial" });

const BUDGET_MS = 1_000;

let cleanup: (() => void) | undefined;

test.beforeAll(async ({ baseURL }) => {
  const api = await playwrightRequest.newContext({ baseURL: baseURL! });
  ({ cleanup } = await seedObservedSession(api));
  await api.dispose();
});

test.afterAll(() => cleanup?.());

/** Run `action`, wait for `ready` to be visible, and assert it took ≤ BUDGET_MS. */
async function timed(label: string, action: () => Promise<void>, ready: Locator) {
  const t0 = performance.now();
  await action();
  await ready.waitFor({ state: "visible", timeout: 10_000 });
  const ms = Math.round(performance.now() - t0);
  test.info().annotations.push({ type: "perf", description: `${label}: ${ms} ms` });
  expect(ms, `${label} took ${ms} ms (budget ${BUDGET_MS} ms, SC-007)`).toBeLessThanOrEqual(
    BUDGET_MS,
  );
}

const heading = (page: Page, name: string | RegExp) =>
  page.getByRole("heading", { level: 1, name, exact: typeof name === "string" });

function navLink(page: Page, label: string): Locator {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: new RegExp(`/${escaped}$`) });
}

/** Sidebar route → its page heading. */
const ROUTES: Array<[label: string, title: string]> = [
  ["canvas", "Agent canvas"],
  ["sessions", "Sessions"],
  ["tasks", "Task board"],
  ["workflows", "Workflows"],
  ["comms", "Communication"],
  ["logs", "Live logs"],
  ["skills & mcp", "Skills & MCP"],
  ["github", "GitHub"],
  ["settings", "Settings"],
  ["overview", "Overview"],
];

test("navigating between the main routes takes ≤ 1 s each", async ({ page }) => {
  await page.goto("/");
  await heading(page, "Overview").waitFor();
  for (const [label, title] of ROUTES) {
    await timed(`navigate to /${label}`, () => navLink(page, label).click(), heading(page, title));
  }
});

test("opening a session from the sessions table takes ≤ 1 s", async ({ page }) => {
  await page.goto("/sessions");
  const row = page.getByRole("row", { name: new RegExp(S1.sessionId.slice(0, 8)) });
  const link = row.getByRole("link").first();
  await link.waitFor();
  await timed(
    "open session",
    () => link.click(),
    heading(page, new RegExp(`^Session ${S1.sessionId.slice(0, 8)}`)),
  );
});

test("opening the task board takes ≤ 1 s", async ({ page }) => {
  await page.goto("/");
  await heading(page, "Overview").waitFor();
  await timed("open task board", () => navLink(page, "tasks").click(), heading(page, "Task board"));
});
