import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { type Agent, TeamViewSchema } from "@nexora/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type EventInput } from "../../src/modules/event-manager";
import { normalizeHook } from "../../src/modules/event-manager/normalizers/hook-normalizer";
import { type HookPayload } from "../../src/modules/event-manager/normalizers/hook-payload";
import { AgentTeamPtyAdapter } from "../../src/modules/runtime-manager/adapters/agent-team-pty/agent-team-pty.adapter";
import {
  type RuntimeDeps,
  type SessionHandle,
} from "../../src/modules/runtime-manager/runtime-adapter";
import { FakePtyModule, SCREENS } from "../fakes/fake-pty";

/*
 * T135 — Agent Teams adapter contract, replayed from the S2 recording (research.md "S2 result"):
 * hooks/*.json in delivery order and snapshots/<n>-<stage>/teams/<team>/ of ~/.claude. The
 * recorded lead ran as PTY pid 6944 with session 9da5d295-…; the fake PTY reuses both so the
 * adapter finds "its" team exactly as in the real run (config.leadProcess.pid === pty pid).
 */

const FIXTURES = fileURLToPath(new URL("../fixtures/teams/", import.meta.url));
const SESSION_ID = "9da5d295-d920-41ad-899a-7b0b1b4a8d68";
const TEAM = "session-9da5d295";
const LEAD_PID = 6944;

const hooks: HookPayload[] = readdirSync(path.join(FIXTURES, "hooks"))
  .sort()
  .map((f) => JSON.parse(readFileSync(path.join(FIXTURES, "hooks", f), "utf8")) as HookPayload);
const hook = (n: number) => hooks[n] as HookPayload;

let home: string;
let root: string;

/** Make ~/.claude look like the recorded stage `n` (teams dir replaced wholesale). */
function snapshot(stage: string): void {
  const dir = readdirSync(path.join(FIXTURES, "snapshots")).find((d) => d.startsWith(`${stage}-`));
  if (!dir) throw new Error(`no snapshot ${stage}`);
  rmSync(path.join(home, "teams"), { recursive: true, force: true });
  cpSync(path.join(FIXTURES, "snapshots", dir, "teams"), path.join(home, "teams"), {
    recursive: true,
  });
}

interface Harness {
  adapter: AgentTeamPtyAdapter;
  handle: SessionHandle;
  events: EventInput[];
  agents: Map<string, Agent>;
  pty: FakePtyModule;
}

async function startLead(): Promise<Harness> {
  const events: EventInput[] = [];
  const agents = new Map<string, Agent>();
  const pty = new FakePtyModule(LEAD_PID);
  const adapter = new AgentTeamPtyAdapter({
    loadPty: () => Promise.resolve(pty),
    claudePath: () => "claude",
    version: () => Promise.resolve("2.1.321 (Claude Code)"),
    claudeHome: home,
    env: {},
    platform: "linux",
    pollIntervalMs: 0,
    newSessionId: () => SESSION_ID,
    agents: { upsert: (a) => agents.set(a.id, { ...agents.get(a.id), ...a }) },
  });
  const deps: RuntimeDeps = {
    sink: { emit: (e) => events.push(e) },
    guard: { check: () => ({ decision: "allow" }) },
    approvals: { request: () => Promise.resolve("deny") },
  };
  const handle = await adapter.start(
    {
      executionId: "01JEXEC0000000000000000000",
      taskId: "T-1",
      projectRoot: root,
      cwd: path.join(root, ".nexora", "worktrees", "e1"),
      prompt: "team of 2 teammates, one writes hello.txt, one bye.txt, then shut down",
      ownedPaths: [],
      permissionMode: "acceptEdits",
    },
    deps,
  );
  return { adapter, handle, events, agents, pty };
}

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), "nexora-teams-"));
  root = mkdtempSync(path.join(tmpdir(), "nexora-repo-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
});

describe("Agent Teams PTY adapter — capability profile", () => {
  it("messages the lead only and cannot pause or resume", () => {
    const caps = new AgentTeamPtyAdapter({
      loadPty: () => Promise.reject(new Error("x")),
    }).capabilities();
    expect(caps.runtime).toBe("agent_team_pty");
    expect(caps.canSendMessage).toBe("lead_only");
    expect(caps.canPause).toBe(false);
    expect(caps.canResume).toBe(false);
    expect(caps.canStart).toBe(true);
    expect(caps.canStop).toBe(true);
    expect(caps.canInterrupt).toBe(true);
    expect(caps.reportsUsage).toBe("none");
  });
});

describe("Agent Teams PTY adapter — S2 replay (hooks + team files)", () => {
  it("finds its team by the lead pid and projects lead, teammates, messages and departures", async () => {
    const h = await startLead();
    expect(await h.handle.sessionId).toBe(SESSION_ID);
    h.pty.last.emit(SCREENS.ready);

    // 1 — team created at session start: the lead only
    snapshot("1");
    const v1 = await h.adapter.refreshTeam(SESSION_ID);
    expect(v1?.teamName).toBe(TEAM);
    expect(v1?.members.map((m) => [m.name, m.isLead, m.status])).toEqual([
      ["team-lead", true, "active"],
    ]);
    const lead = h.agents.get(SESSION_ID);
    expect(lead?.kind).toBe("team_lead");
    expect(lead?.parentAgentId).toBeNull();

    for (let i = 0; i <= 5; i++) h.adapter.ingestHook(hook(i));

    // 2/3 — teammates join (config.members appended)
    snapshot("2");
    await h.adapter.refreshTeam(SESSION_ID);
    for (let i = 6; i <= 8; i++) h.adapter.ingestHook(hook(i));
    snapshot("3");
    const v3 = await h.adapter.refreshTeam(SESSION_ID);
    expect(v3?.members.map((m) => m.name)).toEqual(["team-lead", "teammate-one", "teammate-two"]);
    const one = h.agents.get(`teammate-one@${TEAM}`);
    expect(one).toMatchObject({ kind: "teammate", parentAgentId: SESSION_ID, status: "running" });
    expect(one?.role).toBe("general-purpose");
    const spawned = h.events.filter((e) => e.type === "agent.spawned");
    expect(spawned.map((e) => e.agentId)).toEqual([
      SESSION_ID,
      `teammate-one@${TEAM}`,
      `teammate-two@${TEAM}`,
    ]);
    for (const e of spawned) {
      expect(e).toMatchObject({ source: "team_files", reliability: "best_effort" });
      expect(e.sessionId).toBe(SESSION_ID);
      expect(e.executionId).toBe("01JEXEC0000000000000000000");
    }

    // hooks: teammate work + TeammateIdle (teammate_name) → idle
    for (let i = 9; i <= 21; i++) h.adapter.ingestHook(hook(i));
    expect(
      h.adapter.teamView(SESSION_ID)?.members.find((m) => m.name === "teammate-one"),
    ).toMatchObject({ status: "idle" });
    expect(h.agents.get(`teammate-one@${TEAM}`)?.status).toBe("idle");
    for (let i = 22; i <= 23; i++) h.adapter.ingestHook(hook(i));

    // 4 — lead inbox: structured idle_notification summarised, never shown as raw JSON
    snapshot("4");
    const v4 = await h.adapter.refreshTeam(SESSION_ID);
    const idle = v4?.messages.find((m) => m.kind === "idle_notification");
    expect(idle).toMatchObject({ from: "teammate-two", to: "team-lead" });
    expect(idle?.summary).toMatch(/teammate-two is idle/);
    expect(idle?.summary).toMatch(/DONE/);
    expect(idle?.summary).not.toMatch(/^\{/);

    // 5 — teammate inbox: shutdown_request from the lead
    for (let i = 24; i <= 29; i++) h.adapter.ingestHook(hook(i));
    snapshot("5");
    const v5 = await h.adapter.refreshTeam(SESSION_ID);
    const shutdown = v5?.messages.find((m) => m.kind === "shutdown_request");
    expect(shutdown).toMatchObject({ from: "team-lead", to: "teammate-one" });
    expect(shutdown?.summary).toMatch(/hello\.txt done, team wrapping up/);
    // polling again does not duplicate a message (msg_id)
    await h.adapter.refreshTeam(SESSION_ID);
    expect(h.adapter.teamView(SESSION_ID)?.messages).toHaveLength(2);
    const sent = h.events.filter((e) => e.type === "message.sent");
    expect(sent).toHaveLength(2);
    for (const e of sent) expect(e.reliability).toBe("best_effort");

    // the lead's Stop while teammates are still members does not end the run
    for (let i = 30; i <= 41; i++) h.adapter.ingestHook(hook(i));

    // 6 — cleaned up: teammates removed from config ⇒ left
    snapshot("6");
    const v6 = await h.adapter.refreshTeam(SESSION_ID);
    expect(v6?.members.map((m) => [m.name, m.status])).toEqual([
      ["team-lead", "active"],
      ["teammate-one", "left"],
      ["teammate-two", "left"],
    ]);
    expect(h.agents.get(`teammate-two@${TEAM}`)?.status).toBe("completed");
    const completed = h.events.filter((e) => e.type === "agent.completed");
    expect(completed.map((e) => e.agentId)).toEqual([
      `teammate-one@${TEAM}`,
      `teammate-two@${TEAM}`,
    ]);
    expect(TeamViewSchema.parse(v6)).toBeTruthy();
    expect(v6?.reliability).toBe("best_effort");

    // the lead's next Stop with no teammates left ends the turn (same shape as hooks/33-Stop)
    let settled = false;
    void h.handle.done.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    h.adapter.ingestHook({
      ...hook(33),
      last_assistant_message: "Both files written; team cleaned up.",
    });
    const done = await h.handle.done;
    expect(done.outcome).toBe("completed");
    expect(done.resultText).toBe("Both files written; team cleaned up.");
    expect(
      h.events.some(
        (e) =>
          e.type === "agent.waiting" && (e.payload as { outcome?: string }).outcome === "completed",
      ),
    ).toBe(true);
    await h.handle.stop();
  });

  it("ignores teams of other lead processes and never writes team files", async () => {
    snapshot("3");
    const before = readFileSync(path.join(home, "teams", TEAM, "config.json"), "utf8");
    const events: EventInput[] = [];
    const pty = new FakePtyModule(1234);
    const adapter = new AgentTeamPtyAdapter({
      loadPty: () => Promise.resolve(pty),
      claudePath: () => "claude",
      claudeHome: home,
      env: {},
      platform: "linux",
      pollIntervalMs: 0,
      newSessionId: () => "11111111-2222-3333-4444-555555555555",
    });
    await adapter.start(
      {
        executionId: "01JEXEC0000000000000000000",
        taskId: null,
        projectRoot: root,
        cwd: root,
        prompt: "x",
        ownedPaths: [],
        permissionMode: "default",
      },
      {
        sink: { emit: (e) => events.push(e) },
        guard: { check: () => ({ decision: "allow" }) },
        approvals: { request: () => Promise.resolve("deny") },
      },
    );
    expect(await adapter.refreshTeam("11111111-2222-3333-4444-555555555555")).toBeNull();
    expect(events.filter((e) => e.source === "team_files")).toHaveLength(0);
    expect(readFileSync(path.join(home, "teams", TEAM, "config.json"), "utf8")).toBe(before);
  });

  it("hook payloads keep their normalised meaning (TeammateIdle → agent.waiting, teammates as SubagentStart)", () => {
    const idle = normalizeHook(hook(21));
    expect(idle[0]).toMatchObject({
      type: "agent.waiting",
      agentId: "ateammate-one-a2fbe48e2f0981ca",
    });
    expect(idle[0]?.summary).toBe("Teammate teammate-one is idle");
    expect(normalizeHook(hook(6))[0]?.type).toBe("agent.spawned");
  });

  /*
   * TaskCreated / TaskCompleted did NOT fire in the S2 run (the lead did not use the shared task
   * list, ~/.claude/tasks/<team>/ stayed empty). These cases use the DOCUMENTED payload shape
   * (task_id, task_subject, teammate_name, team_name) — not a recording.
   */
  it("team tasks from TaskCreated/TaskCompleted (documented shape, not recorded) and tasks/<team>/", async () => {
    const h = await startLead();
    snapshot("3");
    await h.adapter.refreshTeam(SESSION_ID);
    const base = { session_id: SESSION_ID, cwd: "<REPO>", team_name: TEAM };
    h.adapter.ingestHook({
      ...base,
      hook_event_name: "TaskCreated",
      task_id: "1",
      task_subject: "Write hello.txt",
      teammate_name: "teammate-one",
    });
    expect(h.adapter.teamView(SESSION_ID)?.tasks).toEqual([
      { id: "1", subject: "Write hello.txt", status: "pending", owner: "teammate-one" },
    ]);
    h.adapter.ingestHook({
      ...base,
      hook_event_name: "TaskCompleted",
      task_id: "1",
      task_subject: "Write hello.txt",
      teammate_name: "teammate-one",
    });
    expect(h.adapter.teamView(SESSION_ID)?.tasks[0]?.status).toBe("completed");
    expect(normalizeHook({ ...base, hook_event_name: "TaskCreated", task_id: "1" })[0]?.type).toBe(
      "task.created",
    );

    // the shared task list on disk (read-only, documented layout: one JSON file per task)
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(path.join(home, "tasks", TEAM), { recursive: true });
    writeFileSync(
      path.join(home, "tasks", TEAM, "2.json"),
      JSON.stringify({
        id: "2",
        subject: "Write bye.txt",
        status: "in_progress",
        owner: "teammate-two",
      }),
    );
    const v = await h.adapter.refreshTeam(SESSION_ID);
    expect(v?.tasks.find((t) => t.id === "2")).toEqual({
      id: "2",
      subject: "Write bye.txt",
      status: "in_progress",
      owner: "teammate-two",
    });
    const created = h.events.filter((e) => e.type === "task.created" && e.source === "team_files");
    expect(created.map((e) => (e.payload as { teamTaskId: string }).teamTaskId)).toEqual(["2"]);
    await h.handle.stop();
  });
});
