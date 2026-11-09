import { request as playwrightRequest } from "@playwright/test";

import { expect, test } from "./fixtures/axe";
import { S1, seedObservedSession } from "./support/us1-seed";

// US1 — watch real agent activity live (quickstart V1). Data comes from recorded real hooks.
test.describe.configure({ mode: "serial" });

let cleanup: (() => void) | undefined;

test.beforeAll(async ({ baseURL }) => {
  const api = await playwrightRequest.newContext({ baseURL: baseURL! });
  cleanup = await seedObservedSession(api);
  await api.dispose();
});

test.afterAll(() => cleanup?.());

test("overview shows live counters and the registered project", async ({
  page,
  expectNoA11yViolations,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Active sessions")).toBeVisible();
  await expect(page.getByText("e2e-demo")).toBeVisible();
  await expect(page.getByRole("status", { name: /realtime connected/i })).toBeVisible();
  await expectNoA11yViolations();
});

test("sessions table lists the observed session as observe-only and stopped", async ({
  page,
  expectNoA11yViolations,
}) => {
  await page.goto("/sessions");
  const row = page.getByRole("row", { name: new RegExp(S1.sessionId.slice(0, 8)) });
  await expect(row).toBeVisible();
  await expect(row.getByText(/observe-only/i)).toBeVisible();
  await expect(row.getByText(/stopped/i)).toBeVisible();
  await expectNoA11yViolations();
});

test("canvas draws main → subagent and opens agent details", async ({
  page,
  expectNoA11yViolations,
}) => {
  await page.goto("/canvas");
  await expect(page.getByText("main", { exact: true })).toBeVisible();
  const sub = page.getByText(S1.subagentType, { exact: true });
  await expect(sub).toBeVisible();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);

  await sub.click();
  await expect(page).toHaveURL(new RegExp(`/agents/${S1.subagentId}$`));
  const panel = page.getByRole("dialog");
  await expect(panel.getByText(S1.writtenFile).first()).toBeVisible();
  await expect(panel.getByText("not available").first()).toBeVisible();
  await expect(panel.getByText(/derived/i).first()).toBeVisible();
  await expectNoA11yViolations();
});

test("live logs search, and export the filtered result as CSV", async ({
  page,
  expectNoA11yViolations,
}) => {
  // the E2E server is shared with the US2/US3 specs, so newer events may push the recorded
  // session off the first page: search for it instead of expecting it unfiltered
  await page.goto("/logs");
  await expect(page.getByRole("button", { name: "Apply" })).toBeVisible();

  await page.getByLabel(/search text/i).fill(`Modified ${S1.writtenFile}`);
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText(`Modified ${S1.writtenFile}`)).toBeVisible();
  await expect(page.getByText(`Read ${S1.writtenFile}`)).toHaveCount(0);

  const csv = page.getByRole("link", { name: /csv/i });
  const href = await csv.getAttribute("href");
  expect(href).toContain("format=csv");
  const res = await page.request.get(href!);
  expect(res.ok()).toBeTruthy();
  const text = await res.text();
  expect(text.split("\r\n")[0]).toBe(
    "id,ts,type,source,reliability,severity,executionId,sessionId,agentId,taskId,summary",
  );
  expect(text).toContain("file.modified");
  expect(text).not.toContain("tool.invoked");
  await expectNoA11yViolations();
});
