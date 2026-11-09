import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { IntegrationListSchema } from "@nexora/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDb, openDb, type Db } from "../../src/db/client";
import { createApp } from "../../src/http/app";
import { registerIntegrationRoutes } from "../../src/http/routes/integrations";
import { createLogger } from "../../src/lib/logger";
import { type HealthProbe } from "../../src/modules/mcp-registry/mcp-registry.service";
import { AuditService } from "../../src/modules/permission-manager/audit.service";
import { ProjectRepository, ProjectService } from "../../src/modules/project-registry";
import { createIntegrationsService } from "../../src/modules/skill-registry/integrations.service";
import { HOST, login, testEnv } from "../helpers/us1";

let db: Db;
let root: string;
let home: string;
let projectId: string;
let app: ReturnType<typeof createApp>;
let auth: { cookie: string; csrf: string };
let probes: string[];
let clock: number;

function write(path: string, value: unknown) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value));
}

const SECRET = "ghp_abcdefghijklmnopqrstuvwxyz0123456789AB";

beforeEach(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "nexora-int-")));
  home = realpathSync(mkdtempSync(join(tmpdir(), "nexora-int-home-")));
  db = openDb({ dataDir: ":memory:" });
  const audit = new AuditService(db);
  const projects = new ProjectService(new ProjectRepository(db), audit);
  projectId = (await projects.register({ rootPath: root }, "user")).id;

  write(join(root, ".claude", "skills", "deploy", "SKILL.md"), "---\ndescription: Ship it\n---\nx");
  write(join(root, ".claude", "commands", "lint.md"), "---\ndescription: Lint\n---\nx");
  write(
    join(root, ".claude", "agents", "reviewer.md"),
    "---\nname: reviewer\ndescription: Reviews\ntools: Read, Grep\n---\nYou review.",
  );
  write(join(home, ".claude", "skills", "notes", "SKILL.md"), "---\ndescription: Notes\n---\nx");
  write(join(root, ".mcp.json"), {
    mcpServers: {
      db: { command: "npx", args: ["db-mcp"], env: { GITHUB_TOKEN: SECRET } },
      docs: { type: "http", url: "https://mcp.example.test/mcp" },
    },
  });
  write(join(root, ".claude", "settings.json"), {
    permissions: { deny: ["Skill(deploy)"], allow: ["mcp__docs"] },
  });

  probes = [];
  clock = 1_000;
  const probe: HealthProbe = (url) => {
    probes.push(url);
    return Promise.resolve({ health: "down", detail: "timed out after 5 s", status: null });
  };
  const integrations = createIntegrationsService({
    db,
    projects,
    homeDir: home,
    probe,
    now: () => clock,
  });
  app = createApp({
    env: testEnv,
    db,
    startedAt: 0,
    logger: createLogger({ level: "silent" }),
    registerRoutes: (api) => registerIntegrationRoutes(api, { integrations }),
  });
  auth = await login(app);
});

afterEach(() => {
  closeDb(db);
  rmSync(root, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

const get = (path: string) =>
  app.request(`/api/v1${path}`, { headers: { ...HOST, cookie: auth.cookie } });

describe("GET /integrations (T146)", () => {
  it("lists skills, commands, agents and MCP servers with permission + health, no secrets", async () => {
    const res = await get(`/integrations?projectId=${projectId}`);
    expect(res.status).toBe(200);
    const body = IntegrationListSchema.parse(await res.json());
    expect(body.discoveredAt).toBe(1_000);
    const by = new Map(body.items.map((i) => [`${i.kind}:${i.name}`, i]));
    expect([...by.keys()].sort()).toEqual([
      "agent_definition:reviewer",
      "command:lint",
      "mcp_server:db",
      "mcp_server:docs",
      "skill:deploy",
      "skill:notes",
    ]);
    expect(by.get("skill:deploy")).toMatchObject({
      scope: "project",
      projectId,
      description: "Ship it",
      executable: true,
      permissionStatus: "denied",
      health: "ok",
    });
    expect(by.get("skill:notes")).toMatchObject({ scope: "user", projectId: null });
    expect(by.get("agent_definition:reviewer")).toMatchObject({
      executable: false,
      metadata: { tools: ["Read", "Grep"] },
    });
    expect(by.get("mcp_server:docs")).toMatchObject({
      permissionStatus: "allowed",
      health: "down",
      healthDetail: "timed out after 5 s",
      checkedAt: 1_000,
    });
    expect(by.get("mcp_server:db")).toMatchObject({ health: "unknown", tools: [] });
    expect(JSON.stringify(body)).not.toContain(SECRET);
    expect(JSON.stringify(body)).not.toContain("You review.");
  });

  it("serves the cached inventory until ?refresh=true, keeping ids stable", async () => {
    const first = IntegrationListSchema.parse(
      await (await get(`/integrations?projectId=${projectId}`)).json(),
    );
    expect(probes).toHaveLength(1);
    clock = 2_000;
    write(join(root, ".claude", "commands", "fmt.md"), "x");

    const cached = IntegrationListSchema.parse(
      await (await get(`/integrations?projectId=${projectId}`)).json(),
    );
    expect(cached.discoveredAt).toBe(1_000);
    expect(cached.items.map((i) => i.name)).not.toContain("fmt");
    expect(probes).toHaveLength(1);

    const fresh = IntegrationListSchema.parse(
      await (await get(`/integrations?projectId=${projectId}&refresh=true`)).json(),
    );
    expect(fresh.discoveredAt).toBe(2_000);
    expect(fresh.items.map((i) => i.name)).toContain("fmt");
    expect(probes).toHaveLength(2);
    const idOf = (l: typeof first, n: string) => l.items.find((i) => i.name === n)?.id;
    expect(idOf(fresh, "deploy")).toBe(idOf(first, "deploy"));
  });

  it("persists the inventory: a new service instance reads it from the db", async () => {
    await get(`/integrations?projectId=${projectId}`);
    const audit = new AuditService(db);
    const again = createIntegrationsService({
      db,
      projects: new ProjectService(new ProjectRepository(db), audit),
      homeDir: home,
      probe: () => Promise.reject(new Error("must not probe")),
      now: () => 9_999,
    });
    const list = await again.list({ projectId });
    expect(list.discoveredAt).toBe(1_000);
    expect(list.items.find((i) => i.name === "docs")).toMatchObject({
      healthDetail: "timed out after 5 s",
      description: null,
    });
    expect(list.items.find((i) => i.name === "docs")?.metadata).not.toHaveProperty("__item");
  });

  it("filters by kind and supports the user-only scope", async () => {
    const mcp = IntegrationListSchema.parse(
      await (await get(`/integrations?projectId=${projectId}&kind=mcp_server`)).json(),
    );
    expect(mcp.items.map((i) => i.name).sort()).toEqual(["db", "docs"]);
    const user = IntegrationListSchema.parse(await (await get("/integrations")).json());
    expect(user.items.map((i) => `${i.scope}:${i.name}`)).toEqual(["user:notes"]);
  });

  it("validates the query and unknown projects", async () => {
    expect((await get("/integrations?kind=nope")).status).toBe(400);
    expect((await get("/integrations?projectId=01ARZ3NDEKTSV4RRFFQ69G5FAV")).status).toBe(404);
  });
});
