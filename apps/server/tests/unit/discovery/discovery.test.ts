import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { discoverMcpServers } from "../../../src/modules/mcp-registry/discovery";
import { discoverSkills } from "../../../src/modules/skill-registry/discovery";

let root: string;
let home: string;

function write(path: string, text: string) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ubuliera-disc-"));
  home = mkdtempSync(join(tmpdir(), "ubuliera-home-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe("discoverSkills", () => {
  it("finds project + user skills, commands, agents and enabled plugin content", async () => {
    write(
      join(root, ".claude/skills/deploy-check/SKILL.md"),
      "---\nname: deploy-check\ndescription: Checks a deploy\n---\n",
    );
    write(
      join(root, ".claude/skills/internal/SKILL.md"),
      "---\nname: internal\ndescription: model only\nuser-invocable: false\n---\n",
    );
    write(join(root, ".claude/commands/git/sync.md"), "---\ndescription: Sync\n---\nDo it");
    write(
      join(root, ".claude/agents/reviewer.md"),
      "---\nname: reviewer\ndescription: Reviews\ntools: Read, Grep\nmodel: sonnet\n---\nYou review code.",
    );
    write(join(home, ".claude/skills/notes/SKILL.md"), "---\nname: notes\n---\n");
    write(join(home, ".claude/commands/standup.md"), "Standup");
    const pluginDir = join(home, ".claude/plugins/cache/acme/tools/1");
    write(join(pluginDir, "skills/lint-fix/SKILL.md"), "---\nname: lint-fix\n---\n");
    write(join(home, ".claude/plugins/cache/acme/off/1/skills/hidden/SKILL.md"), "---\n---\n");
    write(
      join(home, ".claude/settings.json"),
      JSON.stringify({ enabledPlugins: { "tools@acme": true, "off@acme": false } }),
    );
    write(
      join(home, ".claude/plugins/installed_plugins.json"),
      JSON.stringify({
        version: 2,
        plugins: {
          "tools@acme": [{ scope: "user", installPath: pluginDir }],
          "off@acme": [
            { scope: "user", installPath: join(home, ".claude/plugins/cache/acme/off/1") },
          ],
        },
      }),
    );

    const items = await discoverSkills({ projectRoot: root, homeDir: home });
    const brief = items.map((i) => `${i.kind}:${i.scope}:${i.name}:${i.executable}`).sort();
    expect(brief).toEqual(
      [
        "agent_definition:project:reviewer:false",
        "command:project:git:sync:true",
        "command:user:standup:true",
        "skill:plugin:tools:lint-fix:true",
        "skill:project:deploy-check:true",
        "skill:project:internal:false",
        "skill:user:notes:true",
      ].sort(),
    );
    const reviewer = items.find((i) => i.name === "reviewer");
    expect(reviewer?.definition).toEqual({
      description: "Reviews",
      prompt: "You review code.",
      tools: ["Read", "Grep"],
      model: "sonnet",
    });
  });

  it("returns nothing (no throw) when directories are missing", async () => {
    expect(await discoverSkills({ projectRoot: root, homeDir: home })).toEqual([]);
  });
});

describe("discoverMcpServers", () => {
  it("reads .mcp.json and ~/.claude.json and strips env, headers and secrets", async () => {
    write(
      join(root, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          db: {
            command: "npx",
            args: [
              "pg",
              "postgres://admin:hunter2@host/db",
              "--api-key=sk-ant-abcdefghijklmnopqrstu",
            ],
            env: { PGPASSWORD: "hunter2" },
          },
        },
      }),
    );
    write(
      join(home, ".claude.json"),
      JSON.stringify({
        mcpServers: {
          remote: {
            type: "http",
            url: "https://mcp.example.com/x",
            headers: { Authorization: "Bearer abcdefgh123" },
          },
        },
        projects: { [root]: { mcpServers: { local: { command: "node", args: ["srv.js"] } } } },
      }),
    );
    const servers = await discoverMcpServers({ projectRoot: root, homeDir: home });
    expect(servers.map((s) => `${s.scope}:${s.name}:${s.transport}`).sort()).toEqual([
      "project:db:stdio",
      "user:local:stdio",
      "user:remote:http",
    ]);
    const text = JSON.stringify(servers);
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("sk-ant-");
    expect(text).not.toContain("abcdefgh123");
    expect(text).not.toContain("PGPASSWORD");
    expect(servers.find((s) => s.name === "db")?.envKeyCount).toBe(1);
  });

  it("tolerates missing or malformed files", async () => {
    write(join(root, ".mcp.json"), "{not json");
    expect(await discoverMcpServers({ projectRoot: root, homeDir: home })).toEqual([]);
  });
});
