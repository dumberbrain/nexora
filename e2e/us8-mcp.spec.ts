import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { type APIRequestContext, request as playwrightRequest } from "@playwright/test";

import { expect, test } from "./fixtures/axe";
import { removeTempRepo } from "./support/temp-repo";

// US8 — drive Ubuliera from another agent via MCP (quickstart V10): enable MCP and create a token in
// Settings, then a real MCP client lists sessions and `start_execution` stops at approval_required.
test.describe.configure({ mode: "serial" });

const PROMPT = [
  "1. Add a users endpoint in src/api/users.ts",
  "2. Deploy the result to production",
].join("\n");

let root = "";
let api: APIRequestContext;
let csrf = "";
let secret = "";
let tokenName = "";

async function call(method: "post" | "put", path: string, data: unknown = {}) {
  const res = await api[method](`/api/v1${path}`, { headers: { "x-ubuliera-csrf": csrf }, data });
  expect(res.ok(), `${method.toUpperCase()} ${path}`).toBeTruthy();
  return (await res.json()) as Record<string, unknown>;
}

async function mcpClient(baseURL: string, token: string) {
  const client = new Client({ name: "ubuliera-e2e", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL("/mcp", baseURL), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return client;
}

test.beforeAll(async ({ baseURL }) => {
  root = mkdtempSync(join(tmpdir(), "ubuliera-e2e-us8-"));
  tokenName = `e2e-${basename(root)
    .slice(-6)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "x")}`;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "e2e@ubuliera.local");
  git("config", "user.name", "ubuliera e2e");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "e2e-us8" }));
  git("add", ".");
  git("commit", "-q", "-m", "init");

  api = await playwrightRequest.newContext({ baseURL: baseURL! });
  expect((await api.get("/api/v1/auth/session")).ok()).toBeTruthy();
  csrf = (await api.storageState()).cookies.find((c) => c.name === "ubuliera_csrf")!.value;
});

test.afterAll(async () => {
  await api?.dispose();
  removeTempRepo(root);
});

test("settings: enable MCP and create a control token whose secret is shown once", async ({
  page,
  expectNoA11yViolations,
}) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  const mcp = page.getByRole("region", { name: "MCP server" });
  await expect(mcp).toContainText("never approve risky tasks");
  const toggle = mcp.getByRole("switch", { name: "Enable MCP server" });
  if ((await toggle.getAttribute("aria-checked")) !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");

  const remote = page.getByRole("region", { name: "Remote access" });
  await expect(remote.getByRole("switch")).toHaveCount(0);
  await expect(remote.getByRole("button")).toHaveCount(0);
  await expectNoA11yViolations();

  const tokens = page.getByRole("region", { name: "API tokens" });
  const form = tokens.getByRole("form", { name: "Create API token" });
  await form.getByRole("textbox", { name: "Token name" }).fill(tokenName);
  await form.getByRole("radio", { name: "control" }).check();
  await form.getByRole("button", { name: "Create token" }).click();

  const dialog = page.getByRole("dialog", { name: "Token created" });
  await expect(dialog).toContainText("you will not see it again");
  secret = (await dialog.locator("code").first().innerText()).trim();
  expect(secret).toMatch(/^nxr_/);
  await expect(dialog).toContainText("claude mcp add --transport http ubuliera");
  await expectNoA11yViolations();
  await dialog.getByRole("button", { name: "I saved it" }).click();
  await expect(dialog).toBeHidden();

  // gone for good: neither the page nor the API returns it again
  await expect(page.locator("body")).not.toContainText(secret);
  const list = await (await api.get("/api/v1/tokens")).text();
  expect(list).toContain(tokenName);
  expect(list).not.toContain(secret);
  await expect(
    tokens.getByRole("list", { name: "API tokens" }).getByRole("listitem", { name: tokenName }),
  ).toContainText("scope: control");
});

test("an MCP client lists sessions; start_execution never approves a risky task", async ({
  baseURL,
}) => {
  expect(secret, "token from the previous test").toMatch(/^nxr_/);
  const client = await mcpClient(baseURL!, secret);
  const { tools } = await client.listTools();
  expect(tools.map((t) => t.name)).toContain("start_execution");
  expect(tools.map((t) => t.name).some((n) => /approv/.test(n))).toBe(false);

  const sessions = await client.callTool({ name: "list_sessions", arguments: {} });
  expect(sessions.isError).toBeFalsy();

  const project = await call("post", "/projects", { rootPath: root, name: basename(root) });
  const execution = await call("post", "/executions", { projectId: project.id, prompt: PROMPT });
  const executionId = execution.id as string;
  const plan = await client.callTool({
    name: "create_execution_plan",
    arguments: { executionId, mode: "multi_session", strategy: "plan_first" },
  });
  expect(plan.isError).toBeFalsy();

  const started = await client.callTool({ name: "start_execution", arguments: { executionId } });
  expect(started.isError).toBeFalsy();
  const result = started.structuredContent as {
    status: string;
    pendingApprovalTaskIds: string[];
    dashboardUrl: string;
  };
  expect(result.status).toBe("approval_required");
  expect(result.pendingApprovalTaskIds.length).toBeGreaterThan(0);
  expect(result.dashboardUrl).toContain(`/executions/${executionId}`);

  // the risky task still waits for a human in the dashboard
  const pending = (await (await api.get("/api/v1/approvals?status=pending")).json()) as {
    items: { executionId: string | null; taskId: string | null }[];
  };
  const mine = pending.items.filter((a) => a.executionId === executionId).map((a) => a.taskId);
  expect(mine).toEqual(expect.arrayContaining(result.pendingApprovalTaskIds));

  await client.callTool({ name: "stop_execution", arguments: { executionId } });
  await client.close();
  // audit entries (actor mcp_client:<name>) are asserted in tests/integration/mcp-server.test.ts —
  // there is no audit read endpoint in the REST contract
});

test("a revoked token is refused at /mcp", async ({ baseURL, page }) => {
  await page.goto("/settings");
  const tokens = page.getByRole("region", { name: "API tokens" });
  await tokens.getByRole("button", { name: `Revoke token ${tokenName}` }).click();
  const confirm = page.getByRole("alertdialog", { name: `Revoke ${tokenName}?` });
  await confirm.getByRole("button", { name: "Revoke token" }).click();
  await expect(
    tokens.getByRole("list", { name: "API tokens" }).getByRole("listitem", { name: tokenName }),
  ).toHaveAttribute("data-revoked", "true");

  const res = await api.post(new URL("/mcp", baseURL).toString(), {
    headers: { authorization: `Bearer ${secret}`, accept: "application/json, text/event-stream" },
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
  expect(res.status()).toBe(401);
});
