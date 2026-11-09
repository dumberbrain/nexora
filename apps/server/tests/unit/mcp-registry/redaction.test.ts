import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  loadPermissionRules,
  McpRegistryService,
  mcpServerPermission,
  mcpToolPermission,
  type HealthProbe,
  type PermissionRules,
} from "../../../src/modules/mcp-registry/mcp-registry.service";

let root: string;
let home: string;

function write(path: string, value: unknown) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nexora-mcp-"));
  home = mkdtempSync(join(tmpdir(), "nexora-mcp-home-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

const SECRETS = [
  "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789",
  "ghp_abcdefghijklmnopqrstuvwxyz0123456789AB",
  "super-secret-header-value-42",
  "plain-db-password-value",
  "Zx9Qw8Er7Ty6Ui5Op4As3Df2",
];

const probeCalls: string[] = [];
const okProbe: HealthProbe = (url) => {
  probeCalls.push(url);
  return Promise.resolve({ health: "ok", detail: null, status: 200 });
};

function seedConfigs() {
  write(join(root, ".mcp.json"), {
    mcpServers: {
      db: {
        command: "npx",
        args: ["-y", "@acme/db-mcp", "--password", SECRETS[3]],
        env: { DB_PASSWORD: SECRETS[3], ANTHROPIC_API_KEY: SECRETS[0] },
      },
      docs: {
        type: "http",
        url: "https://mcp.example.test/mcp",
        headers: { Authorization: `Bearer ${SECRETS[2]}`, "X-Api-Key": SECRETS[4] },
      },
    },
  });
  write(join(home, ".claude.json"), {
    mcpServers: {
      github: {
        type: "sse",
        url: `https://mcp.example.test/sse?token=${SECRETS[1]}`,
        env: { GITHUB_TOKEN: SECRETS[1] },
      },
    },
  });
}

describe("McpRegistryService redaction (T145)", () => {
  it("never returns env/header values — only key names and counts", async () => {
    seedConfigs();
    const svc = new McpRegistryService({ homeDir: home, probe: okProbe });
    const items = await svc.inventory({ projectRoot: root });
    const text = JSON.stringify(items);
    for (const s of SECRETS) expect(text).not.toContain(s);
    expect(text).not.toContain("Bearer super");

    const db = items.find((i) => i.name === "db");
    expect(db?.metadata).toMatchObject({
      transport: "stdio",
      command: "npx",
      argCount: 4,
      envKeys: ["DB_PASSWORD", "ANTHROPIC_API_KEY"],
      envKeyCount: 2,
      headerKeys: [],
      headerKeyCount: 0,
    });
    expect(db?.metadata).not.toHaveProperty("env");
    expect(db?.metadata).not.toHaveProperty("args");

    const docs = items.find((i) => i.name === "docs");
    expect(docs?.metadata).toMatchObject({
      transport: "http",
      url: "https://mcp.example.test/mcp",
      headerKeys: ["Authorization", "X-Api-Key"],
      headerKeyCount: 2,
    });
    expect(docs?.metadata).not.toHaveProperty("headers");
  });

  it("does not health-check a URL whose credentials were redacted", async () => {
    seedConfigs();
    probeCalls.length = 0;
    const svc = new McpRegistryService({ homeDir: home, probe: okProbe });
    const items = await svc.inventory({ projectRoot: root });
    const gh = items.find((i) => i.name === "github");
    expect(gh?.health).toBe("unknown");
    expect(gh?.healthDetail).toMatch(/credential/i);
    expect(probeCalls).toEqual(["https://mcp.example.test/mcp"]);
  });

  it("stdio servers are never spawned: health unknown with an explanation", async () => {
    seedConfigs();
    const svc = new McpRegistryService({ homeDir: home, probe: okProbe });
    const db = (await svc.inventory({ projectRoot: root })).find((i) => i.name === "db");
    expect(db).toMatchObject({ kind: "mcp_server", health: "unknown", tools: [] });
    expect(db?.healthDetail).toMatch(/stdio/i);
  });

  it("every item passes the redactor even for odd config values", async () => {
    write(join(root, ".mcp.json"), {
      mcpServers: { odd: { command: `node --token=${SECRETS[1]}`, args: [] } },
    });
    const svc = new McpRegistryService({ homeDir: home, probe: okProbe });
    const text = JSON.stringify(await svc.inventory({ projectRoot: root }));
    expect(text).not.toContain(SECRETS[1]);
  });
});

describe("permission status from settings (T145)", () => {
  const rules = (r: Partial<PermissionRules>): PermissionRules => ({
    allow: [],
    deny: [],
    ask: [],
    defaultMode: null,
    ...r,
  });

  it("merges user, project and local settings; deny > ask > allow", async () => {
    write(join(home, ".claude", "settings.json"), {
      permissions: { allow: ["mcp__db", "mcp__docs__search"], deny: ["mcp__github"] },
    });
    write(join(root, ".claude", "settings.json"), {
      permissions: { ask: ["mcp__docs"], allow: ["mcp__github"] },
    });
    write(join(root, ".claude", "settings.local.json"), {
      permissions: { deny: ["mcp__db__drop_table"] },
    });
    const merged = await loadPermissionRules({ projectRoot: root, homeDir: home });
    expect(merged.allow).toEqual(
      expect.arrayContaining(["mcp__db", "mcp__docs__search", "mcp__github"]),
    );
    expect(mcpServerPermission(merged, "db")).toBe("allowed");
    expect(mcpToolPermission(merged, "db", "query")).toBe("allowed");
    expect(mcpToolPermission(merged, "db", "drop_table")).toBe("denied");
    expect(mcpServerPermission(merged, "github")).toBe("denied"); // deny beats project allow
    expect(mcpServerPermission(merged, "docs")).toBe("ask");
    expect(mcpToolPermission(merged, "docs", "search")).toBe("ask"); // server ask beats tool allow
    expect(mcpServerPermission(merged, "unknown")).toBe("ask"); // Claude Code asks by default
  });

  it("supports the mcp__<server>__* form and ignores look-alike server names", () => {
    const r = rules({ allow: ["mcp__fs__*"], deny: ["mcp__fsx"] });
    expect(mcpServerPermission(r, "fs")).toBe("allowed");
    expect(mcpToolPermission(r, "fs", "read")).toBe("allowed");
    expect(mcpServerPermission(r, "fsx")).toBe("denied");
    expect(mcpToolPermission(r, "f", "s__read")).toBe("ask");
  });

  it("bypassPermissions default mode allows everything not denied or asked", () => {
    const r = rules({ deny: ["mcp__x__rm"], defaultMode: "bypassPermissions" });
    expect(mcpServerPermission(r, "x")).toBe("allowed");
    expect(mcpToolPermission(r, "x", "rm")).toBe("denied");
  });

  it("malformed settings are ignored", async () => {
    write(join(home, ".claude", "settings.json"), "{ not json");
    write(join(root, ".claude", "settings.json"), { permissions: { allow: "mcp__db" } });
    const merged = await loadPermissionRules({ projectRoot: root, homeDir: home });
    expect(merged).toEqual({ allow: [], deny: [], ask: [], defaultMode: null });
  });

  it("inventory items carry the derived server permission", async () => {
    seedConfigs();
    write(join(root, ".claude", "settings.json"), {
      permissions: { allow: ["mcp__db"], deny: ["mcp__docs"] },
    });
    const svc = new McpRegistryService({ homeDir: home, probe: okProbe });
    const items = await svc.inventory({ projectRoot: root });
    const by = Object.fromEntries(items.map((i) => [i.name, i.permissionStatus]));
    expect(by).toEqual({ db: "allowed", docs: "denied", github: "ask" });
  });
});
