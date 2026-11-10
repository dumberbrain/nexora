import { readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

import { describe, expect, it, type Mock, vi } from "vitest";

import { PathGuardError } from "../../src/lib/path-guard";
import { type EventInput } from "../../src/modules/event-manager";
import {
  AgentSdkAdapter,
  type QueryFn,
  type SdkQuery,
} from "../../src/modules/runtime-manager/adapters/agent-sdk/agent-sdk.adapter";
import { MessageMapper } from "../../src/modules/runtime-manager/adapters/agent-sdk/message-mapper";
import { AGENT_SDK_CAPABILITIES } from "../../src/modules/runtime-manager/capabilities";
import {
  type ApprovalGate,
  type StartSessionInput,
  type ToolDecision,
  type ToolGuard,
} from "../../src/modules/runtime-manager/runtime-adapter";

const FIX = join(import.meta.dirname, "..", "fixtures");
const lines = (rel: string): Record<string, unknown>[] =>
  readFileSync(join(FIX, rel), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Record<string, unknown>);

const SID = "06109064-d9fe-49a8-9df1-ddcb12bca712";

function mapper(source: "agent_sdk" | "stream_json" = "agent_sdk") {
  const events: EventInput[] = [];
  const m = new MessageMapper(
    { executionId: "01EXEC", taskId: "T-1", source },
    { emit: (e) => events.push(e) },
  );
  return { m, events };
}

describe("MessageMapper — recorded SDK stream (S3 phase 1)", () => {
  it("maps init, tools, results and the interrupted turn", () => {
    const { m, events } = mapper();
    const signals = [];
    for (const raw of lines("sdk/phase1.jsonl")) {
      if (raw.ubuliera === "interrupt() returned") {
        m.markInterrupted();
        continue;
      }
      const s = m.map(raw);
      if (s) signals.push(s);
    }

    expect(signals[0]).toEqual({
      kind: "init",
      sessionId: SID,
      model: "claude-haiku-5-5",
      cwd: "C:\\work\\demo-repo",
      first: true,
    });
    const results = signals.filter((s) => s.kind === "result");
    expect(results).toHaveLength(2);
    expect(results[0]?.result).toMatchObject({
      outcome: "completed",
      sessionId: SID,
      resultText: "OK",
      error: null,
      usage: {
        inputTokens: 1196 + 20223 + 24632,
        outputTokens: 145,
        costUsd: 0.005320730000000001,
        costIsEstimate: true,
      },
    });
    expect(results[1]?.result.outcome).toBe("interrupted");
    expect(signals.filter((s) => s.kind === "init").map((s) => s.first)).toEqual([true, false]);

    const types = events.map((e) => e.type);
    expect(types.filter((t) => t === "session.started")).toHaveLength(1);
    const started = events.find((e) => e.type === "session.started");
    expect(started).toMatchObject({
      source: "agent_sdk",
      reliability: "authoritative",
      sessionId: SID,
      executionId: "01EXEC",
      taskId: "T-1",
      payload: { model: "claude-haiku-5-5", cwd: "C:\\work\\demo-repo" },
    });
    const invoked = events.find((e) => e.type === "tool.invoked");
    expect(invoked).toMatchObject({ agentId: null, sessionId: SID });
    expect(invoked?.summary).toContain("PowerShell");
    expect(events.find((e) => e.type === "tool.completed")).toMatchObject({
      payload: { toolUseId: "toolu_01DBnhaj9YdeFvh8iy1dS9EV", toolName: "PowerShell" },
    });
    // rate_limit_event / commands_changed are ignored; no file.modified for a shell tool
    expect(types).not.toContain("file.modified");
    expect(events.every((e) => e.source === "agent_sdk")).toBe(true);
  });

  it("an error result without our own interrupt is a failure", () => {
    const { m } = mapper();
    const all = lines("sdk/phase1.jsonl").filter((r) => r.ubuliera === undefined);
    let last = null;
    for (const raw of all) last = m.map(raw) ?? last;
    expect(last).toMatchObject({ kind: "result", result: { outcome: "failed" } });
  });

  it("maps a resumed session (phase 2) to the same session id", () => {
    const { m } = mapper();
    const signals = lines("sdk/phase2-resume.jsonl")
      .map((r) => m.map(r))
      .filter((s) => s !== null);
    expect(signals[0]).toMatchObject({ kind: "init", sessionId: SID });
    expect(signals.at(-1)).toMatchObject({
      kind: "result",
      result: { outcome: "completed", resultText: "a.txt" },
    });
  });
});

describe("MessageMapper — subagent tree (S1 stream-json)", () => {
  it("derives agent.spawned / agent.completed and attributes subagent tools", () => {
    const { m, events } = mapper("stream_json");
    for (const raw of lines("stream-json/s1-subagent-write.jsonl")) m.map(raw);
    const AGENT = "toolu_01BwbkLFgJ3PnnQDd6i2NBgH";

    const spawned = events.find((e) => e.type === "agent.spawned");
    expect(spawned).toMatchObject({
      agentId: AGENT,
      source: "stream_json",
      payload: { parentAgentId: null, subagentType: "general-purpose" },
    });
    const write = events.find(
      (e) => e.type === "tool.invoked" && (e.payload as { toolName: string }).toolName === "Write",
    );
    expect(write?.agentId).toBe(AGENT);
    const file = events.find((e) => e.type === "file.modified");
    expect(file).toMatchObject({
      agentId: AGENT,
      reliability: "derived",
      payload: { path: "hello.txt", tool: "Write" },
    });
    const completed = events.find((e) => e.type === "agent.completed");
    expect(completed).toMatchObject({ agentId: AGENT });
    expect(events.findIndex((e) => e.type === "agent.completed")).toBeGreaterThan(
      events.findIndex((e) => e.type === "file.modified"),
    );
  });
});

// ---------------------------------------------------------------- adapter with a fake SDK query

interface FakeQuery extends SdkQuery {
  feed(msg: Record<string, unknown>): void;
  end(): void;
  interrupt: ReturnType<typeof vi.fn<() => Promise<unknown>>>;
  close: ReturnType<typeof vi.fn<() => void>>;
  setPermissionMode: Mock<SdkQuery["setPermissionMode"]>;
}

function fakeQuery(): FakeQuery {
  const items: Record<string, unknown>[] = [];
  let wake: (() => void) | undefined;
  let ended = false;
  const q = {
    feed(msg: Record<string, unknown>) {
      items.push(msg);
      wake?.();
    },
    end() {
      ended = true;
      wake?.();
    },
    interrupt: vi.fn(() => Promise.resolve({ still_queued: [] })),
    close: vi.fn(() => q.end()),
    setPermissionMode: vi.fn(() => Promise.resolve()),
    async *[Symbol.asyncIterator]() {
      for (;;) {
        while (items.length) yield items.shift();
        if (ended) return;
        await new Promise<void>((r) => (wake = r));
        wake = undefined;
      }
    },
  };
  return q;
}

const REPO = resolve(sep, "work", "demo-repo");

const input: StartSessionInput = {
  executionId: "01EXEC",
  taskId: "T-1",
  projectRoot: REPO,
  cwd: REPO,
  prompt: "do it",
  ownedPaths: [],
  permissionMode: "default",
  maxTurns: 5,
};

function setup(decision: ToolDecision, approval: "allow" | "deny" = "allow") {
  const q = fakeQuery();
  let captured: Parameters<QueryFn>[0] | undefined;
  const queryFn: QueryFn = (params) => {
    captured = params;
    return q;
  };
  const events: EventInput[] = [];
  const guard: { check: Mock<ToolGuard["check"]> } = { check: vi.fn(() => decision) };
  const approvals: { request: Mock<ApprovalGate["request"]> } = {
    request: vi.fn(() => Promise.resolve(approval)),
  };
  const onSessionId = vi.fn();
  const adapter = new AgentSdkAdapter({ queryFn });
  return {
    q,
    adapter,
    guard,
    approvals,
    onSessionId,
    events,
    options: () => {
      if (!captured) throw new Error("query not started");
      return captured.options;
    },
    deps: { sink: { emit: (e: EventInput) => events.push(e) }, guard, approvals, onSessionId },
  };
}

const permissionCall = lines("sdk/permissions.jsonl")[0] as {
  toolName: string;
  input: Record<string, unknown>;
  opts: { toolUseID: string; requestId: string };
};
const hookCall = lines("sdk/hooks.jsonl")[0] as { input: unknown; toolUseID: string };
const signal = new AbortController().signal;

describe("AgentSdkAdapter", () => {
  it("advertises the agent_sdk capability profile", () => {
    expect(new AgentSdkAdapter({ queryFn: () => fakeQuery() }).capabilities()).toEqual(
      AGENT_SDK_CAPABILITIES,
    );
    expect(AGENT_SDK_CAPABILITIES.reportsUsage).toBe("estimate");
    expect(AGENT_SDK_CAPABILITIES.canPause).toBe(false);
  });

  it("passes session options and uses the user's settings sources", async () => {
    const t = setup({ decision: "allow" });
    await t.adapter.start({ ...input, model: "haiku", maxBudgetUsd: 2 }, t.deps);
    expect(t.options()).toMatchObject({
      cwd: input.cwd,
      model: "haiku",
      permissionMode: "default",
      maxTurns: 5,
      maxBudgetUsd: 2,
      settingSources: ["user", "project", "local"],
    });
    expect(t.options().hooks?.PreToolUse?.[0]?.matcher).toBe("*");
  });

  it("routes canUseTool 'ask' decisions to the ApprovalGate (S3 PowerShell call)", async () => {
    const t = setup({ decision: "ask", riskClass: "normal", reason: "Shell command" });
    await t.adapter.start(input, t.deps);
    const canUseTool = t.options().canUseTool;
    if (!canUseTool) throw new Error("canUseTool missing");
    const r = await canUseTool(permissionCall.toolName, permissionCall.input, {
      ...permissionCall.opts,
      signal,
    });
    expect(t.approvals.request).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: "01EXEC",
        taskId: "T-1",
        toolName: "PowerShell",
        riskClass: "normal",
        reason: "Shell command",
      }),
    );
    expect(r).toEqual({ behavior: "allow", updatedInput: permissionCall.input });
    // permission.requested / decided events are the ApprovalGate's job (no duplicates here)
    expect(t.events).toEqual([]);
  });

  it("denies via canUseTool when the guard or the human denies", async () => {
    const denied = setup({ decision: "deny", reason: "outside scope" });
    await denied.adapter.start(input, denied.deps);
    const r1 = await denied.options().canUseTool?.("Write", {}, { ...permissionCall.opts, signal });
    expect(r1).toEqual({ behavior: "deny", message: "outside scope" });
    expect(denied.approvals.request).not.toHaveBeenCalled();

    const human = setup({ decision: "ask", riskClass: "normal", reason: "x" }, "deny");
    await human.adapter.start(input, human.deps);
    const r2 = await human.options().canUseTool?.("Bash", {}, { ...permissionCall.opts, signal });
    expect(r2).toMatchObject({ behavior: "deny" });
  });

  it("PreToolUse hook: deny → deny, ask → ask, allow → {} (never auto-allows)", async () => {
    const cases: [ToolDecision, unknown][] = [
      [
        { decision: "deny", reason: "outside" },
        {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: "outside",
          },
        },
      ],
      [
        { decision: "ask", riskClass: "normal", reason: "shell" },
        {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "ask",
            permissionDecisionReason: "shell",
          },
        },
      ],
      [{ decision: "allow" }, {}],
    ];
    for (const [decision, expected] of cases) {
      const t = setup(decision);
      await t.adapter.start(input, t.deps);
      const hook = t.options().hooks?.PreToolUse?.[0]?.hooks[0];
      if (!hook) throw new Error("hook missing");
      const out = await hook(hookCall.input as Parameters<typeof hook>[0], hookCall.toolUseID, {
        signal,
      });
      expect(out).toEqual(expected);
      expect(t.guard.check).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: SID, toolName: "PowerShell", agentId: null }),
      );
    }
  });

  it("drives a session: init → sessionId, result → done; interrupt → interrupted; sendMessage → new turn", async () => {
    const t = setup({ decision: "allow" });
    const handle = await t.adapter.start(input, t.deps);
    const [init, , , toolUse, toolResult, text, result1, init2, , , , , result2] =
      lines("sdk/phase1.jsonl");
    for (const m of [init, toolUse, toolResult, text, result1]) if (m) t.q.feed(m);
    await expect(handle.sessionId).resolves.toBe(SID);
    expect(t.onSessionId).toHaveBeenCalledWith(SID, {
      model: "claude-haiku-5-5",
      cwd: "C:\\work\\demo-repo",
    });
    await expect(handle.done).resolves.toMatchObject({ outcome: "completed", resultText: "OK" });

    await handle.sendMessage("count");
    await handle.interrupt();
    expect(t.q.interrupt).toHaveBeenCalledTimes(1);
    if (init2) t.q.feed(init2);
    if (result2) t.q.feed(result2);
    await expect(handle.done).resolves.toMatchObject({ outcome: "interrupted" });

    await handle.setPermissionMode("acceptEdits");
    expect(t.q.setPermissionMode).toHaveBeenCalledWith("acceptEdits");

    await handle.stop();
    expect(t.q.close).toHaveBeenCalled();
    expect(t.events.at(-1)?.type).toBe("session.stopped");
  });

  it("refuses a cwd outside the project root (path guard) before querying", async () => {
    const queryFn = vi.fn(() => fakeQuery());
    const adapter = new AgentSdkAdapter({ queryFn });
    await expect(
      adapter.start(
        { ...input, cwd: resolve(sep, "elsewhere") },
        {
          sink: { emit: () => undefined },
          guard: { check: () => ({ decision: "allow" }) },
          approvals: { request: () => Promise.resolve("deny") },
        },
      ),
    ).rejects.toBeInstanceOf(PathGuardError);
    expect(queryFn).not.toHaveBeenCalled();
  });

  it("resolves the turn as failed when the SDK stream throws", async () => {
    const queryFn: QueryFn = () => ({
      interrupt: () => Promise.resolve(undefined),
      close: () => undefined,
      setPermissionMode: () => Promise.resolve(),

      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        throw new Error("spawn failed");
      },
    });
    const adapter = new AgentSdkAdapter({ queryFn });
    const handle = await adapter.start(input, {
      sink: { emit: () => undefined },
      guard: { check: () => ({ decision: "allow" }) },
      approvals: { request: () => Promise.resolve("deny") },
    });
    await expect(handle.done).resolves.toMatchObject({ outcome: "failed", error: "spawn failed" });
    await expect(handle.sessionId).rejects.toThrow();
  });
});
