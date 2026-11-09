import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { type APIRequestContext, request as playwrightRequest } from "@playwright/test";

import { expect, test } from "./fixtures/axe";
import { removeTempRepo } from "./support/temp-repo";

// US3 — control running executions (quickstart V5) on the test-only fake runtime. The hold
// marker keeps fake task sessions running until a control ends them.
test.describe.configure({ mode: "serial" });

const PROMPT = [
  "1. Prepare release notes in docs/notes.md [e2e:hold]",
  "2. Deploy the result to production",
  "3. Publish the package release",
].join("\n");

let root = "";
let executionId = "";
let api: APIRequestContext;
let csrf = "";

async function call(method: "post" | "put", path: string, data: unknown = {}) {
  const res = await api[method](`/api/v1${path}`, { headers: { "x-nexora-csrf": csrf }, data });
  expect(res.ok(), `${method.toUpperCase()} ${path}`).toBeTruthy();
  return (await res.json()) as Record<string, unknown>;
}

test.beforeAll(async ({ baseURL }) => {
  root = mkdtempSync(join(tmpdir(), "nexora-e2e-us3-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "e2e@nexora.local");
  git("config", "user.name", "nexora e2e");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "e2e-us3" }));
  git("add", ".");
  git("commit", "-q", "-m", "init");

  api = await playwrightRequest.newContext({ baseURL: baseURL! });
  expect((await api.get("/api/v1/auth/session")).ok()).toBeTruthy();
  csrf = (await api.storageState()).cookies.find((c) => c.name === "nexora_csrf")!.value;
  const project = await call("post", "/projects", { rootPath: root, name: basename(root) });
  const execution = await call("post", "/executions", { projectId: project.id, prompt: PROMPT });
  executionId = execution.id as string;
  await call("put", `/executions/${executionId}/mode`, {
    mode: "multi_session",
    strategy: "plan_first",
  });
  await call("post", `/executions/${executionId}/plan`);
  await call("post", `/executions/${executionId}/approve`);
});

test.afterAll(async () => {
  await api?.dispose();
  removeTempRepo(root);
});

test("approvals inbox: approve one risky task, reject the other", async ({
  page,
  expectNoA11yViolations,
}) => {
  await page.goto(`/executions/${executionId}`);
  const inbox = page.getByRole("region", { name: /approvals inbox/i });
  const deploy = inbox.getByRole("article").filter({ hasText: "T-2" });
  const publish = inbox.getByRole("article").filter({ hasText: "T-3" });
  await expect(deploy).toBeVisible();
  await expect(publish).toBeVisible();
  await expectNoA11yViolations();

  await deploy.getByRole("button", { name: "Approve" }).click();
  await expect(deploy).toBeHidden();
  await publish.getByRole("button", { name: "Reject" }).click();
  await expect(publish).toBeHidden();

  const table = page.getByRole("table", { name: /task statuses/i });
  const row = (id: string) => table.getByRole("row").filter({ hasText: id });
  await expect(row("T-1")).toContainText("Running");
  await expect(row("T-2")).toContainText("Running");
  await expect(row("T-3")).toContainText("Cancelled");
  await expectNoA11yViolations();
});

test("stop ends the execution within 5 s; a stopped session shows Interrupt & hold disabled with a reason", async ({
  page,
  expectNoA11yViolations,
}) => {
  await page.goto(`/executions/${executionId}`);
  const toolbar = page.getByRole("toolbar", { name: /execution controls/i });
  await expect(toolbar.getByRole("button", { name: "Interrupt & hold" })).toBeEnabled();
  await toolbar.getByRole("button", { name: "Stop" }).click();
  const dialog = page.getByRole("dialog", { name: /stop this execution/i });
  await expect(dialog).toBeVisible();
  await expectNoA11yViolations();

  const started = Date.now();
  await dialog.getByRole("button", { name: "Stop now" }).click();
  const table = page.getByRole("table", { name: /task statuses/i });
  await expect(table.getByRole("row").filter({ hasText: "T-1" })).not.toContainText("Running", {
    timeout: 5_000,
  });
  expect(Date.now() - started).toBeLessThanOrEqual(5_000);

  const sessions = await api.get(`/api/v1/sessions?executionId=${executionId}`);
  const { items } = (await sessions.json()) as { items: { id: string; status: string }[] };
  expect(items.length).toBeGreaterThan(0);
  await expect
    .poll(async () => {
      const res = await api.get(`/api/v1/sessions?executionId=${executionId}`);
      const body = (await res.json()) as { items: { status: string }[] };
      return body.items.every((s) => s.status === "stopped");
    })
    .toBe(true);

  await page.goto(`/sessions/${items[0]!.id}`);
  const controls = page.getByRole("toolbar", { name: /session controls/i });
  const hold = controls.getByRole("button", { name: "Interrupt & hold" });
  await expect(hold).toBeDisabled();
  await expect(hold).toHaveAccessibleDescription(/.+/);
  await expectNoA11yViolations();
});
