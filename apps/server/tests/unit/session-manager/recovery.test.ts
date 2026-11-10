import { type EntityChanged, type Session, type SessionStatus } from "@nexora/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EXTERNAL_OBSERVED_CAPABILITIES } from "../../../src/modules/session-manager";
import {
  RECOVERABLE_STATUSES,
  recoverSessions,
} from "../../../src/modules/session-manager/recovery";
import { createHarness, type Harness } from "../../helpers/us1";

let h: Harness;
let changes: EntityChanged[];
let projectId: string;
let clock = 1_700_000_000_000;

beforeEach(async () => {
  h = createHarness();
  projectId = (await h.services.projects.register({ rootPath: h.tmp }, "user")).id;
  changes = [];
  h.bus.onEntityChanged((c) => changes.push(c));
});
afterEach(() => h.close());

function seed(id: string, status: SessionStatus, over: Partial<Session> = {}): void {
  h.services.sessions.insert({
    id,
    executionId: null,
    executionMode: null,
    currentTaskId: null,
    projectId,
    runtime: "external_observed",
    observeOnly: true,
    cwd: h.tmp,
    gitBranch: "main",
    worktreePath: null,
    model: null,
    status,
    capabilities: EXTERNAL_OBSERVED_CAPABILITIES,
    pid: null,
    usage: null,
    lastActivityAt: clock,
    startedAt: clock,
    endedAt: status === "stopped" ? clock : null,
    ...over,
  });
}

const apply = (sessionId: string, hookEventName: string) =>
  h.services.sessionProjection.apply({
    sessionId,
    hookEventName,
    cwd: h.tmp,
    tokenProjectId: projectId,
    ts: ++clock,
  });

const statusOf = (id: string) => h.services.sessions.get(id)?.status;

describe("recoverSessions (restart recovery)", () => {
  it("marks running sessions without a live handle as unknown", () => {
    seed("observed", "running");
    seed("managed", "running", { runtime: "agent_sdk", observeOnly: false, pid: 4242 });

    const res = recoverSessions({ sessions: h.services.sessions, bus: h.bus });

    expect(res.marked.sort()).toEqual(["managed", "observed"]);
    expect(statusOf("observed")).toBe("unknown");
    expect(statusOf("managed")).toBe("unknown");
    expect(
      changes.filter((c) => c.kind === "session" && c.patch.status === "unknown").map((c) => c.id),
    ).toEqual(expect.arrayContaining(["observed", "managed"]));
  });

  it("covers every non-terminal status and leaves terminal ones alone", () => {
    for (const s of RECOVERABLE_STATUSES) seed(`s-${s}`, s);
    seed("done", "stopped");
    seed("broken", "failed");
    seed("lost", "unknown");

    recoverSessions({ sessions: h.services.sessions, bus: h.bus });

    for (const s of RECOVERABLE_STATUSES) expect(statusOf(`s-${s}`), s).toBe("unknown");
    expect(statusOf("done")).toBe("stopped");
    expect(statusOf("broken")).toBe("failed");
    expect(statusOf("lost")).toBe("unknown");
    expect(RECOVERABLE_STATUSES).toContain("running");
    expect(RECOVERABLE_STATUSES).not.toContain("stopped");
  });

  it("keeps sessions that still have a live handle", () => {
    seed("alive", "running", { runtime: "agent_sdk", observeOnly: false });
    seed("gone", "running", { runtime: "agent_sdk", observeOnly: false });

    const res = recoverSessions({
      sessions: h.services.sessions,
      bus: h.bus,
      isLive: (id) => id === "alive",
    });

    expect(res.marked).toEqual(["gone"]);
    expect(statusOf("alive")).toBe("running");
    expect(statusOf("gone")).toBe("unknown");
  });

  it("preserves the session row and its event history", () => {
    seed("hist", "running", { model: "claude-opus", usage: null });
    h.store.append({
      type: "tool.invoked",
      source: "hook",
      reliability: "authoritative",
      severity: "info",
      sessionId: "hist",
      summary: "Read a.ts",
    });
    h.store.flush();
    const before = h.services.sessions.get("hist");

    recoverSessions({ sessions: h.services.sessions, bus: h.bus });

    expect(h.services.sessions.get("hist")).toEqual({ ...before, status: "unknown" });
    expect(h.store.list({ sessionId: "hist", limit: 10 }).items).toHaveLength(1);
  });

  it("re-attaches an observed session as running on its next hook event", () => {
    seed("obs", "running");
    recoverSessions({ sessions: h.services.sessions, bus: h.bus });
    expect(statusOf("obs")).toBe("unknown");

    expect(apply("obs", "PreToolUse").status).toBe("running");
    expect(statusOf("obs")).toBe("running");
  });

  it("re-attaches as running even when the next hook is passive", () => {
    seed("quiet", "idle");
    recoverSessions({ sessions: h.services.sessions, bus: h.bus });

    expect(apply("quiet", "Notification").status).toBe("running");
    // a passive hook on a known status still leaves it alone
    expect(apply("quiet", "Stop").status).toBe("idle");
    expect(apply("quiet", "Notification").status).toBe("idle");
  });

  it("is a no-op when nothing is running", () => {
    seed("done", "stopped");
    expect(recoverSessions({ sessions: h.services.sessions, bus: h.bus }).marked).toEqual([]);
    expect(changes).toEqual([]);
  });
});
