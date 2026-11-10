import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AGENT_TEAMS_FLAG,
  type ClaudeProbe,
  detectAgentTeams,
  detectClaude,
} from "../../../src/modules/runtime-manager/environment";

let home: string;
let project: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "ubuliera-home-"));
  project = mkdtempSync(join(tmpdir(), "ubuliera-proj-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

const settings = (dir: string, file: string, body: unknown) => {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", file), typeof body === "string" ? body : JSON.stringify(body));
};

describe("detectAgentTeams", () => {
  it("is enabled by the process environment", () => {
    const r = detectAgentTeams({
      env: { [AGENT_TEAMS_FLAG]: "1" },
      homeDir: home,
      projectRoots: [],
    });
    expect(r).toEqual({ enabled: true, detail: `${AGENT_TEAMS_FLAG}=1 is set in the environment` });
  });

  it("is enabled by the user settings env", () => {
    settings(home, "settings.json", { env: { [AGENT_TEAMS_FLAG]: "1" } });
    const r = detectAgentTeams({ env: {}, homeDir: home, projectRoots: [] });
    expect(r.enabled).toBe(true);
    expect(r.detail).toContain("settings.json");
  });

  it("is enabled by project (local) settings env", () => {
    settings(project, "settings.local.json", { env: { [AGENT_TEAMS_FLAG]: "1" } });
    const r = detectAgentTeams({ env: {}, homeDir: home, projectRoots: [project] });
    expect(r.enabled).toBe(true);
    expect(r.detail).toContain("settings.local.json");
  });

  it("is disabled with how-to-enable guidance; other values and broken files are ignored", () => {
    settings(home, "settings.json", "{ not json");
    settings(project, "settings.json", { env: { [AGENT_TEAMS_FLAG]: "0" } });
    const r = detectAgentTeams({
      env: { [AGENT_TEAMS_FLAG]: "true" },
      homeDir: home,
      projectRoots: [project],
    });
    expect(r.enabled).toBe(false);
    expect(r.detail).toContain(`Set ${AGENT_TEAMS_FLAG}=1`);
  });
});

const probe = (over: Partial<ClaudeProbe>): ClaudeProbe => ({
  version: () => Promise.resolve("2.1.3 (Claude Code)\n"),
  authStatus: () => Promise.resolve({ exitCode: 0, stdout: '{"loggedIn":true}', stderr: "" }),
  ...over,
});

describe("detectClaude", () => {
  it("reports version and login state without spending model usage", async () => {
    await expect(detectClaude(probe({}), {})).resolves.toEqual({
      installed: true,
      version: "2.1.3 (Claude Code)",
      authenticated: true,
      reason: null,
    });
  });

  it("not logged in → authenticated false with a reason", async () => {
    const r = await detectClaude(
      probe({
        authStatus: () =>
          Promise.resolve({ exitCode: 1, stdout: '{"loggedIn":false}', stderr: "" }),
      }),
      {},
    );
    expect(r).toMatchObject({ installed: true, authenticated: false });
    expect(r.reason).toContain("claude auth login");
  });

  it("an API key in the environment counts as authenticated", async () => {
    const r = await detectClaude(
      probe({ authStatus: () => Promise.reject(new Error("unknown command")) }),
      { ANTHROPIC_API_KEY: "sk-test" },
    );
    expect(r).toMatchObject({ authenticated: true });
  });

  it("unknown auth state → null", async () => {
    const r = await detectClaude(
      probe({ authStatus: () => Promise.reject(new Error("unknown command 'auth'")) }),
      {},
    );
    expect(r.authenticated).toBeNull();
  });

  it("missing CLI → not installed", async () => {
    const r = await detectClaude(
      probe({ version: () => Promise.reject(new Error("not found")) }),
      {},
    );
    expect(r).toMatchObject({ installed: false, version: null, authenticated: null });
    expect(r.reason).toContain("not found");
  });
});
