import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import {
  type APIRequestContext,
  type Locator,
  request as playwrightRequest,
} from "@playwright/test";

import { expect, test } from "./fixtures/axe";

// US5 — build and run a workflow (quickstart V7) on the test-only fake runtime.
test.describe.configure({ mode: "serial" });

/** Select the option whose text starts with `text` (labels carry a kind suffix). */
async function choose(select: Locator, text: string) {
  // options of a closed <select> have no rendered text, so read them from the DOM
  const value = await select.evaluate(
    (el, prefix) =>
      [...(el as HTMLSelectElement).options].find((o) => o.text.startsWith(prefix))?.value,
    text,
  );
  expect(value, `option starting with "${text}"`).toBeTruthy();
  await select.selectOption(value!);
}

let root = "";
let projectName = "";
let api: APIRequestContext;
let csrf = "";

test.beforeAll(async ({ baseURL }) => {
  root = mkdtempSync(join(tmpdir(), "nexora-e2e-us5-"));
  projectName = basename(root);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "e2e@nexora.local");
  git("config", "user.name", "nexora e2e");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "e2e-us5" }));
  git("add", ".");
  git("commit", "-q", "-m", "init");

  api = await playwrightRequest.newContext({ baseURL: baseURL! });
  expect((await api.get("/api/v1/auth/session")).ok()).toBeTruthy();
  csrf = (await api.storageState()).cookies.find((c) => c.name === "nexora_csrf")!.value;
  const res = await api.post("/api/v1/projects", {
    headers: { "x-nexora-csrf": csrf },
    data: { rootPath: root, name: projectName },
  });
  expect(res.status()).toBe(201);
});

test.afterAll(async () => {
  await api?.dispose();
  if (root) rmSync(root, { recursive: true, force: true });
});

test("built-in templates are listed", async ({ page, expectNoA11yViolations }) => {
  await page.goto("/workflows");
  const list = page.getByRole("list", { name: "Workflows" });
  for (const name of ["Spec-driven feature", "TDD feature", "Review and merge"]) {
    await expect(list.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await expectNoA11yViolations();
});

test("build with the keyboard-friendly editor, save v2, run it and approve the gate", async ({
  page,
  expectNoA11yViolations,
}) => {
  const name = `e2e flow ${projectName.slice(-6)}`;
  await page.goto("/workflows");
  const create = page.getByRole("form", { name: "Create workflow" });
  await create.getByRole("textbox", { name: "Name" }).fill(name);
  await create.getByRole("button", { name: "Create workflow" }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Workflow canvas" })).toBeVisible();

  // add an approval gate between start and end, without dragging
  await page.getByRole("button", { name: "Add Approval node" }).click();
  const inspector = page.getByLabel("Node inspector");
  const selected = inspector.getByRole("combobox", { name: "Selected node" });
  const connectTo = inspector.getByRole("combobox", { name: "Connect to" });
  await choose(selected, "Approval 1");
  const props = inspector.getByRole("form", { name: "Properties of Approval 1" });
  await props.getByRole("textbox", { name: "Message" }).fill("Ship it?");
  await props.getByRole("button", { name: "Apply changes" }).click();
  await choose(connectTo, "End");
  await inspector.getByRole("button", { name: "Add connection" }).click();

  await choose(selected, "Start");
  await inspector.getByRole("button", { name: "Remove connection to End" }).click();
  await choose(connectTo, "Approval 1");
  await inspector.getByRole("button", { name: "Add connection" }).click();

  await expect(page.getByRole("status").filter({ hasText: "Graph is valid" })).toBeVisible();
  await expectNoA11yViolations();
  await page.getByRole("button", { name: "Save as new version" }).click();
  await expect(page.getByRole("button", { name: "Run version 2" })).toBeVisible();

  // run v2
  await page.getByRole("button", { name: "Run version 2" }).click();
  const dialog = page.getByRole("dialog", { name: `Run ${name} v2` });
  const project = dialog.getByRole("combobox", { name: "Project" });
  const value = await project.locator("option", { hasText: projectName }).getAttribute("value");
  await project.selectOption(value!);
  await dialog.getByRole("button", { name: "Start run" }).click();

  await expect(page).toHaveURL(/\/executions\/[0-9A-Z]{26}$/);
  const run = page.getByRole("region", { name: "Workflow run" });
  await expect(run).toContainText("version 2");
  await expect(run.getByText("Waiting for approval").first()).toBeVisible({ timeout: 15_000 });
  await expectNoA11yViolations();

  // approve the gate from the execution's approvals inbox
  const inbox = page.getByRole("region", { name: /approvals inbox/i });
  await inbox.getByRole("button", { name: "Approve" }).first().click();
  await expect(run.getByText(/Run Completed/i)).toBeVisible({ timeout: 15_000 });
});
