import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { type APIRequestContext, request as playwrightRequest } from "@playwright/test";

import { expect, test } from "./fixtures/axe";
import { removeTempRepo } from "./support/temp-repo";

// US6 — Agent Teams + Hybrid (quickstart V8) on the test-only fake runtime. There is no PTY lead
// here, so Agent Teams must be shown as unavailable (never simulated) with a working enable flow;
// the team canvas itself is covered by component tests + the S2 fixture contract test.
test.describe.configure({ mode: "serial" });

const PROMPT = [
  "1. Add a users endpoint in src/api/users.ts",
  "2. Build the users page in src/web/users.tsx",
].join("\n");

let root = "";
let projectId = "";
let api: APIRequestContext;
let csrf = "";

async function call(method: "post" | "put", path: string, data: unknown = {}) {
  const res = await api[method](`/api/v1${path}`, { headers: { "x-ubuliera-csrf": csrf }, data });
  expect(res.ok(), `${method.toUpperCase()} ${path}`).toBeTruthy();
  return (await res.json()) as Record<string, unknown>;
}

test.beforeAll(async ({ baseURL }) => {
  root = mkdtempSync(join(tmpdir(), "ubuliera-e2e-us6-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "e2e@ubuliera.local");
  git("config", "user.name", "ubuliera e2e");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "e2e-us6" }));
  git("add", ".");
  git("commit", "-q", "-m", "init");

  api = await playwrightRequest.newContext({ baseURL: baseURL! });
  expect((await api.get("/api/v1/auth/session")).ok()).toBeTruthy();
  csrf = (await api.storageState()).cookies.find((c) => c.name === "ubuliera_csrf")!.value;
  projectId = (await call("post", "/projects", { rootPath: root, name: basename(root) }))
    .id as string;
});

test.afterAll(async () => {
  await api?.dispose();
  removeTempRepo(root);
});

test("Agent Teams is disabled with instructions and can be enabled for the project", async ({
  page,
  expectNoA11yViolations,
}) => {
  const execution = await call("post", "/executions", { projectId, prompt: PROMPT });
  await page.goto(`/executions/new?step=mode&executionId=${execution.id as string}`);

  const teams = page.getByRole("radio", { name: /^agent teams/i });
  await expect(teams).toBeDisabled();
  const enable = page.getByRole("region", { name: "Enable Agent Teams" });
  await expect(enable).toBeVisible();
  await expectNoA11yViolations();

  const form = enable.getByRole("form", { name: "Enable Agent Teams for this project" });
  // a wrong phrase is refused
  await form.getByRole("textbox", { name: /type enable agent teams to confirm/i }).fill("yes");
  await form.getByRole("button", { name: "Enable for this project" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /exactly to confirm/i })).toBeVisible();
  expect(existsSync(join(root, ".claude", "settings.local.json"))).toBe(false);

  await form
    .getByRole("textbox", { name: /type enable agent teams to confirm/i })
    .fill("enable agent teams");
  await form.getByRole("button", { name: "Enable for this project" }).click();
  await expect
    .poll(() => existsSync(join(root, ".claude", "settings.local.json")), { timeout: 10_000 })
    .toBe(true);
  const settings = JSON.parse(
    readFileSync(join(root, ".claude", "settings.local.json"), "utf8"),
  ) as { env?: Record<string, string> };
  expect(settings.env?.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBe("1");

  // still never simulated: without a PTY lead runtime the mode stays unavailable
  const modes = (await (
    await api.get(`/api/v1/executions/${execution.id as string}/modes`)
  ).json()) as {
    items: { mode: string; available: boolean }[];
  };
  expect(modes.items.find((m) => m.mode === "agent_teams")?.available).toBe(false);
});

test("a hybrid plan explains the mechanism of every task", async ({
  page,
  expectNoA11yViolations,
}) => {
  const execution = await call("post", "/executions", { projectId, prompt: PROMPT });
  const id = execution.id as string;
  await call("put", `/executions/${id}/mode`, { mode: "hybrid", strategy: "plan_first" });
  await call("post", `/executions/${id}/plan`);

  await page.goto(`/executions/new?step=plan&executionId=${id}`);
  const plan = page.getByRole("table", { name: "Execution plan" });
  await expect(plan.getByRole("columnheader", { name: "Mechanism" })).toBeVisible();
  await expect(plan.getByRole("columnheader", { name: "Reason" })).toBeVisible();
  await expect(plan.getByRole("row")).toHaveCount(3);
  await expect(plan.getByText("no reason given")).toHaveCount(0);
  await expect(plan).not.toContainText(/agent teams/i);
  await expectNoA11yViolations();
});
