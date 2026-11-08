import { type EntityChanged } from "@nexora/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type AgentObservation } from "../../../src/modules/agent-registry";
import { createHarness, type Harness } from "../../helpers/us1";

const S = "sess-tree";
let h: Harness;
let changes: EntityChanged[];

beforeEach(async () => {
  h = createHarness();
  const projectId = (await h.services.projects.register({ rootPath: h.tmp }, "user")).id;
  h.services.sessionProjection.apply({
    sessionId: S,
    hookEventName: "UserPromptSubmit",
    cwd: h.tmp,
    tokenProjectId: projectId,
    ts: Date.now(),
  });
  changes = [];
  h.bus.onEntityChanged((c) => changes.push(c));
});
afterEach(() => h.close());

const obs = (hookEventName: string, over: Partial<AgentObservation> = {}): AgentObservation => ({
  sessionId: S,
  hookEventName,
  agentId: null,
  agentType: null,
  toolName: null,
  toolUseId: null,
  subagentType: null,
  lastAssistantMessage: null,
  ...over,
});
const apply = (hook: string, over: Partial<AgentObservation> = {}) =>
  h.services.agentTree.apply(obs(hook, over));
const agent = (id: string) => h.services.agents.get(id);
const spawnCall = (toolUseId: string, subagentType: string, agentId: string | null = null) =>
  apply("PreToolUse", { toolName: "Agent", toolUseId, subagentType, agentId });

describe("AgentTree", () => {
  it("creates the main agent for the session", () => {
    apply("UserPromptSubmit");
    expect(agent(S)).toMatchObject({
      id: S,
      sessionId: S,
      kind: "main",
      name: "main",
      parentAgentId: null,
      status: "running",
      currentTaskId: null,
    });
  });

  it("links SubagentStart to the caller of the latest unmatched Agent call (derived)", () => {
    spawnCall("t1", "general-purpose");
    const r = apply("SubagentStart", { agentId: "a1", agentType: "general-purpose" });
    expect(r.parentAgentId).toBe(S);
    expect(agent("a1")).toMatchObject({
      kind: "subagent",
      name: "general-purpose",
      role: "general-purpose",
      parentAgentId: S,
      status: "running",
    });
    expect(changes.some((c) => c.kind === "agent" && c.id === "a1")).toBe(true);
  });

  it("nests subagents spawned by subagents", () => {
    spawnCall("t1", "planner");
    apply("SubagentStart", { agentId: "a1", agentType: "planner" });
    spawnCall("t2", "Explore", "a1");
    apply("SubagentStart", { agentId: "a2", agentType: "Explore" });
    expect(agent("a2")?.parentAgentId).toBe("a1");
    const children = h.services.agents.children("a1").map((a) => a.id);
    expect(children).toEqual(["a2"]);
  });

  it("consumes one pending call per SubagentStart, preferring a matching subagent type", () => {
    spawnCall("t0", "planner");
    apply("SubagentStart", { agentId: "p", agentType: "planner" });
    spawnCall("t1", "Explore"); // by main
    spawnCall("t2", "general-purpose", "p"); // by the planner, more recent
    apply("SubagentStart", { agentId: "a1", agentType: "Explore" });
    apply("SubagentStart", { agentId: "a2", agentType: "general-purpose" });
    expect(agent("a1")?.parentAgentId).toBe(S);
    expect(agent("a2")?.parentAgentId).toBe("p");
  });

  it("ignores Agent calls that already completed", () => {
    spawnCall("t1", "planner");
    apply("SubagentStart", { agentId: "a1", agentType: "planner" });
    spawnCall("t2", "Explore", "a1");
    apply("PostToolUse", { toolName: "Agent", toolUseId: "t2", agentId: "a1" });
    // no unmatched call left → falls back to the main agent
    apply("SubagentStart", { agentId: "a3", agentType: "Explore" });
    expect(agent("a3")?.parentAgentId).toBe(S);
  });

  it("completes a subagent on SubagentStop with its redacted summary", () => {
    spawnCall("t1", "general-purpose");
    apply("SubagentStart", { agentId: "a1", agentType: "general-purpose" });
    apply("SubagentStop", {
      agentId: "a1",
      agentType: "general-purpose",
      lastAssistantMessage: "Done. token=sk-ant-abcdefghijklmnopqrstuvwxyz",
    });
    const a = agent("a1");
    expect(a?.status).toBe("completed");
    expect(a?.summary).toContain("Done.");
    expect(a?.summary).not.toContain("sk-ant-abcdefghijklmnop");
    // late events never resurrect a completed subagent
    apply("PostToolUse", { agentId: "a1", toolName: "Read" });
    expect(agent("a1")?.status).toBe("completed");
  });

  it("caps the summary at 20 000 chars", () => {
    apply("SubagentStop", {
      agentId: "a9",
      agentType: "x",
      lastAssistantMessage: "y".repeat(30_000),
    });
    expect(agent("a9")?.summary?.length).toBeLessThanOrEqual(20_000);
  });

  it("creates an unknown subagent on its first event under the main agent", () => {
    apply("PreToolUse", { agentId: "ghost", agentType: "Explore", toolName: "Read" });
    expect(agent("ghost")).toMatchObject({ parentAgentId: S, status: "running", name: "Explore" });
  });

  it("tracks main agent idle/waiting/running and stops everything on SessionEnd", () => {
    apply("UserPromptSubmit");
    apply("SubagentStart", { agentId: "a1", agentType: "Explore" });
    apply("Stop", { lastAssistantMessage: "DONE" });
    expect(agent(S)).toMatchObject({ status: "idle", summary: "DONE" });
    apply("Notification");
    expect(agent(S)?.status).toBe("waiting");
    apply("UserPromptSubmit");
    expect(agent(S)?.status).toBe("running");
    apply("SessionEnd");
    expect(agent(S)?.status).toBe("stopped");
    expect(agent("a1")?.status).toBe("stopped");
  });
});
