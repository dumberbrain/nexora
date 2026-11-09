import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { type APIRequestContext, request as playwrightRequest } from "@playwright/test";

import { expect, test } from "./fixtures/axe";
import { removeTempRepo } from "./support/temp-repo";

// US7 — integrations inventory + GitHub (quickstart V9). The project carries its own skill, agent
// and an MCP server whose env holds a secret that must never reach the browser.
test.describe.configure({ mode: "serial" });

const SECRET = "hunter2-e2e-secret-value";
let root = "";
let projectId = "";
let api: APIRequestContext;

test.beforeAll(async ({ baseURL }) => {
  root = mkdtempSync(join(tmpdir(), "nexora-e2e-us7-"));
  mkdirSync(join(root, ".claude", "skills", "release-notes"), { recursive: true });
  writeFileSync(
    join(root, ".claude", "skills", "release-notes", "SKILL.md"),
    "---\nname: release-notes\ndescription: Draft release notes from merged PRs\n---\nBody",
  );
  mkdirSync(join(root, ".claude", "agents"), { recursive: true });
  writeFileSync(
    join(root, ".claude", "agents", "api-guardian.md"),
    "---\nname: api-guardian\ndescription: Reviews public API changes\ntools: Read, Grep\n---\nReview.",
  );
  writeFileSync(
    join(root, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        "e2e-postgres": {
          command: "npx",
          args: ["pg-mcp"],
          env: { PGPASSWORD: SECRET },
        },
      },
    }),
  );

  api = await playwrightRequest.newContext({ baseURL: baseURL! });
  expect((await api.get("/api/v1/auth/session")).ok()).toBeTruthy();
  const csrf = (await api.storageState()).cookies.find((c) => c.name === "nexora_csrf")!.value;
  const res = await api.post("/api/v1/projects", {
    headers: { "x-nexora-csrf": csrf },
    data: { rootPath: root, name: basename(root) },
  });
  expect(res.status()).toBe(201);
  projectId = ((await res.json()) as { id: string }).id;
});

test.afterAll(async () => {
  await api?.dispose();
  removeTempRepo(root);
});

test("integrations list the project's skill, agent and MCP server without secrets", async ({
  page,
  expectNoA11yViolations,
}) => {
  await page.goto(`/integrations?projectId=${projectId}&tab=skills`);
  await expect(page.getByRole("heading", { name: "Skills & MCP" })).toBeVisible();
  const skills = page.getByRole("list", { name: "Skills" });
  const skill = skills.getByRole("listitem", { name: /release-notes/ });
  await expect(skill).toBeVisible();
  await expect(skill).toContainText("executable");
  await expect(skill).toContainText("scope: project");
  await expectNoA11yViolations();

  await page.getByRole("tab", { name: "Agents" }).click();
  await expect(
    page.getByRole("list", { name: "Agents" }).getByRole("listitem", { name: /api-guardian/ }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "MCP servers" }).click();
  const mcp = page.getByRole("list", { name: "MCP servers" }).getByRole("listitem", {
    name: /e2e-postgres/,
  });
  await expect(mcp).toBeVisible();
  await expect(mcp).toContainText("health: unknown");
  await expect(mcp).toContainText(/permission: /);
  await expectNoA11yViolations();

  // the secret is in neither the page nor the API response
  await expect(page.locator("body")).not.toContainText(SECRET);
  const raw = await (await api.get(`/api/v1/integrations?projectId=${projectId}`)).text();
  expect(raw).not.toContain(SECRET);
  expect(raw).toContain("e2e-postgres");
});

test("GitHub view shows the gh status and either setup guidance or repository data", async ({
  page,
  expectNoA11yViolations,
}) => {
  await page.goto("/github");
  await expect(page.getByRole("heading", { name: "GitHub", level: 1 })).toBeVisible();
  const status = page.getByRole("region", { name: "GitHub status" });
  await expect(status).toBeVisible();
  const statusRes = await api.get("/api/v1/github/status");
  expect(statusRes.ok()).toBeTruthy();
  const { status: gh } = (await statusRes.json()) as { status: string };

  if (gh === "not_installed") {
    await expect(page.getByRole("region", { name: "Install the GitHub CLI" })).toBeVisible();
  } else if (gh === "not_authenticated") {
    await expect(page.getByRole("region", { name: "Sign in to GitHub" })).toBeVisible();
    await expect(page.getByText("gh auth login").first()).toBeVisible();
  } else {
    await expect(status).toContainText("connected");
  }
  await expectNoA11yViolations();
});
