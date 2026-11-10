import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { request as playwrightRequest } from "@playwright/test";

import { expect, test } from "./fixtures/axe";
import { removeTempRepo } from "./support/temp-repo";

// US2 — task → plan → approval → execution (quickstart V2), on the test-only fake runtime
// (UBULIERA_TEST_FAKE_RUNTIME=1, NODE_ENV=test) with real git worktrees.
test.describe.configure({ mode: "serial" });

let PROJECT = "";
const PROMPT = [
  "1. Add a users endpoint in src/api/users.ts",
  "2. Build the users page in src/web/users.tsx",
  "3. Deploy the result to production",
].join("\n");

let root = "";

test.beforeAll(async ({ baseURL }) => {
  root = mkdtempSync(join(tmpdir(), "ubuliera-e2e-us2-"));
  // unique per run: CI runs every browser project (and retries) against one server
  PROJECT = basename(root);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "e2e@ubuliera.local");
  git("config", "user.name", "ubuliera e2e");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "e2e-us2" }));
  git("add", ".");
  git("commit", "-q", "-m", "init");

  const api = await playwrightRequest.newContext({ baseURL: baseURL! });
  expect((await api.get("/api/v1/auth/session")).ok()).toBeTruthy();
  const csrf = (await api.storageState()).cookies.find((c) => c.name === "ubuliera_csrf")?.value;
  const res = await api.post("/api/v1/projects", {
    headers: { "x-ubuliera-csrf": csrf! },
    data: { rootPath: root, name: PROJECT },
  });
  expect(res.status()).toBe(201);
  await api.dispose();
});

test.afterAll(() => {
  removeTempRepo(root);
});

test("wizard: task → mode → questions → plan with risky approval → live execution", async ({
  page,
  expectNoA11yViolations,
}) => {
  await page.goto("/executions/new");
  await expect(page.getByRole("form", { name: /submit task/i })).toBeVisible();
  await expectNoA11yViolations();

  // 1. task
  const projectSelect = page.getByLabel(/^project/i);
  const value = await projectSelect.locator("option", { hasText: PROJECT }).getAttribute("value");
  await projectSelect.selectOption(value!);
  await page.getByLabel(/task description/i).fill(PROMPT);
  await page.getByRole("button", { name: /analyse task/i }).click();

  // 2. mode
  await expect(page).toHaveURL(/step=mode/, { timeout: 15_000 });
  await expect(page.getByRole("region", { name: /task analysis/i })).toBeVisible();
  await expect(page.getByRole("radio", { name: /multi-session/i })).toBeChecked();
  await expectNoA11yViolations();
  await page.getByRole("button", { name: /use this mode/i }).click();

  // 3. questions (recommended defaults)
  await expect(page).toHaveURL(/step=questions/, { timeout: 15_000 });
  const save = page.getByRole("button", { name: /save answers|continue/i });
  await expect(save).toBeVisible();
  await expectNoA11yViolations();
  await save.click();

  // 4. plan: generate locally, then approve with the risky deploy task ticked
  await expect(page).toHaveURL(/step=plan/, { timeout: 15_000 });
  await page.getByRole("button", { name: /generate plan/i }).click();
  const risky = page.getByRole("checkbox", { name: /approve risky task T-3/i });
  await expect(risky).toBeVisible();
  await expect(risky).not.toBeChecked();
  await expect(page.getByRole("switch", { name: /permission bypass|bypass/i })).not.toBeChecked();
  await expectNoA11yViolations();
  await risky.check();
  await page.getByRole("button", { name: /approve & start/i }).click();

  // 5. live execution view
  await expect(page).toHaveURL(/\/executions\/[0-9A-Z]{26}$/, { timeout: 15_000 });
  const table = page.getByRole("table", { name: /task statuses/i });
  await expect(table.getByRole("cell", { name: "Completed", exact: true })).toHaveCount(3, {
    timeout: 20_000,
  });
  // execution status badge next to the mode label in the page header
  await expect(
    page.getByRole("main").getByText("Completed", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole("main").getByText("Completed", { exact: true })).toHaveCount(4);
  const verification = page.getByRole("region", { name: /verification/i });
  await expect(verification).toContainText("src/api/users.ts");
  await expectNoA11yViolations();
});
