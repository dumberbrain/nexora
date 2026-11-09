import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import {
  type APIRequestContext,
  type Locator,
  type Page,
  request as playwrightRequest,
} from "@playwright/test";

import { expect, test } from "./fixtures/axe";
import { removeTempRepo } from "./support/temp-repo";

// US4 — task board (quickstart V6) on the test-only fake runtime. One parallel slot plus the
// hold marker keep T-1 running while T-2/T-3 wait in Todo.
test.describe.configure({ mode: "serial" });

const PROMPT = [
  "1. Write the changelog in docs/changelog.md [e2e:hold]",
  "2. Add a users endpoint in src/api/users.ts",
  "3. Build the users page in src/web/users.tsx",
].join("\n");

/** Keyboard drag one column, waiting for each dnd-kit live-region announcement. */
async function keyboardMove(
  page: Page,
  card: Locator,
  key: "ArrowLeft" | "ArrowRight",
  to: string,
) {
  await card.focus();
  await page.keyboard.press("Space");
  await expect(page.getByText(/^Picked up /)).toBeVisible();
  await page.keyboard.press(key);
  await expect(page.getByText(new RegExp(`is over ${to} — drop allowed`))).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByText(new RegExp(`moved to ${to}`))).toBeVisible();
}

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
  root = mkdtempSync(join(tmpdir(), "nexora-e2e-us4-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "e2e@nexora.local");
  git("config", "user.name", "nexora e2e");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "e2e-us4" }));
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
  await call("put", `/executions/${executionId}/config`, {
    config: { maxParallelSessions: 1, parallelism: "parallel" },
  });
  await call("post", `/executions/${executionId}/plan`);
  await call("post", `/executions/${executionId}/approve`);
});

test.afterAll(async () => {
  if (executionId)
    await api.post(`/api/v1/executions/${executionId}/stop`, {
      headers: { "x-nexora-csrf": csrf },
    });
  await api?.dispose();
  removeTempRepo(root);
});

test("board: Todo ⇄ Backlog by keyboard is saved; a running card cannot be moved", async ({
  page,
  expectNoA11yViolations,
}) => {
  await page.goto(`/tasks?executionId=${executionId}`);
  const board = page.getByRole("region", { name: "Task board" });
  const column = (name: string) => board.getByRole("list", { name, exact: true });
  await expect(column("In Progress").getByRole("button", { name: /^T-1 / })).toBeVisible();
  await expect(column("Todo").getByRole("button", { name: /^T-2 / })).toBeVisible();
  await expectNoA11yViolations();

  // Todo → Backlog (queued → pending): one column left
  await keyboardMove(page, board.getByRole("button", { name: /^T-2 / }), "ArrowLeft", "Backlog");
  await expect(column("Backlog").getByRole("button", { name: /^T-2 / })).toBeVisible();

  // persisted on the server, survives a reload
  await page.reload();
  await expect(column("Backlog").getByRole("button", { name: /^T-2 / })).toBeVisible();

  // Backlog → Todo (pending → queued) is accepted
  await keyboardMove(page, board.getByRole("button", { name: /^T-2 / }), "ArrowRight", "Todo");
  await expect(column("Todo").getByRole("button", { name: /^T-2 / })).toBeVisible();

  // a running card is not draggable and says why
  const t1 = column("In Progress").getByRole("button", { name: /^T-1 / });
  await expect(t1).toHaveAttribute("aria-disabled", "true");
  await expect(t1).toHaveAccessibleDescription(/only backlog and todo cards can be dragged/i);
  await expectNoA11yViolations();
});

test("server refuses running → completed with a reason", async () => {
  const res = await api.patch(`/api/v1/executions/${executionId}/tasks/T-1/status`, {
    headers: { "x-nexora-csrf": csrf },
    data: { status: "completed" },
  });
  expect(res.status()).toBe(409);
  const body = (await res.json()) as { error: { code: string; message: string } };
  expect(body.error.code).toBe("CONFLICT");
  expect(body.error.message).toMatch(/not a user move/i);
});
