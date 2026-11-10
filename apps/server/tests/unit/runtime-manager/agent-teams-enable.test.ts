import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { EnableAgentTeamsResultSchema, type TeamView, TeamViewSchema } from "@ubuliera/contracts";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type AppBindings } from "../../../src/http/context";
import { AppError } from "../../../src/http/errors";
import { errorMapper } from "../../../src/http/middleware/error-mapper";
import { registerRuntimeRoutes } from "../../../src/http/routes/runtime";
import { createLogger } from "../../../src/lib/logger";
import { type AuditInput } from "../../../src/modules/permission-manager/audit.service";
import { enableAgentTeams } from "../../../src/modules/runtime-manager/agent-teams-settings";
import { detectAgentTeams } from "../../../src/modules/runtime-manager/environment";

const PID = "01JPRJ00000000000000000000";
let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "ubuliera-teams-enable-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const settingsFile = () => path.join(root, ".claude", "settings.local.json");
const readSettings = () => JSON.parse(readFileSync(settingsFile(), "utf8")) as unknown;

describe("enableAgentTeams (settings merge)", () => {
  it("creates .claude/settings.local.json with the flag", async () => {
    const r = await enableAgentTeams(root);
    expect(r).toEqual({ settingsPath: settingsFile(), changed: true });
    expect(readSettings()).toEqual({ env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" } });
    expect(detectAgentTeams({ env: {}, homeDir: root, projectRoots: [root] }).enabled).toBe(true);
  });

  it("preserves every existing key and env entry", async () => {
    mkdirSync(path.join(root, ".claude"));
    writeFileSync(
      settingsFile(),
      JSON.stringify({
        permissions: { allow: ["Bash(npm test)"] },
        env: { FOO: "bar", CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "0" },
        hooks: { Stop: [] },
      }),
    );
    expect((await enableAgentTeams(root)).changed).toBe(true);
    expect(readSettings()).toEqual({
      permissions: { allow: ["Bash(npm test)"] },
      env: { FOO: "bar", CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" },
      hooks: { Stop: [] },
    });
  });

  it("changed:false and no write when the flag is already set", async () => {
    mkdirSync(path.join(root, ".claude"));
    const text = '{"env":{"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS":"1"},"x":1}';
    writeFileSync(settingsFile(), text);
    expect((await enableAgentTeams(root)).changed).toBe(false);
    expect(readFileSync(settingsFile(), "utf8")).toBe(text);
  });

  it("never overwrites a malformed settings file", async () => {
    mkdirSync(path.join(root, ".claude"));
    writeFileSync(settingsFile(), "{ not json");
    await expect(enableAgentTeams(root)).rejects.toThrow(/not valid JSON/);
    expect(readFileSync(settingsFile(), "utf8")).toBe("{ not json");
    writeFileSync(settingsFile(), "[1]");
    await expect(enableAgentTeams(root)).rejects.toThrow(/JSON object/);
  });
});

const VIEW: TeamView = {
  sessionId: "9da5d295-d920-41ad-899a-7b0b1b4a8d68",
  teamName: "session-9da5d295",
  members: [
    {
      agentId: "team-lead@session-9da5d295",
      name: "team-lead",
      agentType: "team-lead",
      isLead: true,
      status: "active",
      joinedAt: 1,
      cwd: "/repo",
    },
  ],
  tasks: [],
  messages: [],
  reliability: "best_effort",
  updatedAt: 2,
};

function app(opts: { enable?: (root: string) => Promise<never> } = {}) {
  const audits: AuditInput[] = [];
  const invalidate = vi.fn();
  const api = new Hono<AppBindings>();
  api.onError(errorMapper(createLogger({ level: "silent" })));
  api.use(async (c, next) => {
    c.set("actor", "user");
    await next();
  });
  registerRuntimeRoutes(api, {
    runtime: {
      environment: () => Promise.reject(new Error("unused")),
      invalidateEnvironment: invalidate,
    },
    agentTeams: {
      projects: {
        get: (id) => {
          if (id !== PID) throw new AppError("NOT_FOUND", "Project not found");
          return { id, rootPath: root };
        },
      },
      audit: {
        record: (a) => {
          audits.push(a);
          return a as never;
        },
      },
      ...(opts.enable ? { enable: opts.enable } : {}),
    },
    teams: {
      isLeadSession: (id) => id === VIEW.sessionId || id === "lead-without-team",
      refreshTeam: (id) => Promise.resolve(id === VIEW.sessionId ? VIEW : null),
    },
  });
  const post = (body: unknown) =>
    api.request("/runtime/agent-teams/enable", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  return { api, audits, invalidate, post };
}

describe("POST /runtime/agent-teams/enable", () => {
  it("requires the exact confirmation phrase (denied + audited, nothing written)", async () => {
    const { post, audits } = app();
    const res = await post({ projectId: PID, confirmation: "yes" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(
      /enable agent teams/,
    );
    expect(audits).toEqual([
      expect.objectContaining({ action: "runtime.agent_teams.enable", outcome: "denied" }),
    ]);
    expect(() => readFileSync(settingsFile())).toThrow();
  });

  it("writes the flag, audits success and refreshes the environment; idempotent", async () => {
    const { post, audits, invalidate } = app();
    const first = await post({ projectId: PID, confirmation: "enable agent teams" });
    expect(first.status).toBe(200);
    expect(EnableAgentTeamsResultSchema.parse(await first.json())).toEqual({
      projectId: PID,
      settingsPath: settingsFile(),
      changed: true,
    });
    expect(invalidate).toHaveBeenCalledTimes(1);
    const second = await post({ projectId: PID, confirmation: "enable agent teams" });
    expect(((await second.json()) as { changed: boolean }).changed).toBe(false);
    expect(
      audits.map((a) => [a.outcome, a.targetId, (a.details as { changed: boolean }).changed]),
    ).toEqual([
      ["success", PID, true],
      ["success", PID, false],
    ]);
  });

  it("unknown project → 404; a failing write → 409 audited as failed", async () => {
    expect(
      (
        await app().post({
          projectId: "01JZZZZZZZZZZZZZZZZZZZZZZZ",
          confirmation: "enable agent teams",
        })
      ).status,
    ).toBe(404);
    const { post, audits } = app({ enable: () => Promise.reject(new Error("disk full")) });
    const res = await post({ projectId: PID, confirmation: "enable agent teams" });
    expect(res.status).toBe(409);
    expect(audits.at(-1)).toMatchObject({ outcome: "failed", details: { error: "disk full" } });
  });
});

describe("GET /sessions/:id/team", () => {
  it("returns the TeamView of a Ubuliera-started lead", async () => {
    const res = await app().api.request(`/sessions/${VIEW.sessionId}/team`);
    expect(res.status).toBe(200);
    expect(TeamViewSchema.parse(await res.json())).toEqual(VIEW);
  });

  it("404 when the session is not an Agent Teams lead or has no team yet", async () => {
    const { api } = app();
    expect((await api.request("/sessions/other/team")).status).toBe(404);
    const noTeam = await api.request("/sessions/lead-without-team/team");
    expect(noTeam.status).toBe(404);
    expect(((await noTeam.json()) as { error: { message: string } }).error.message).toMatch(
      /not created its team/,
    );
  });
});
