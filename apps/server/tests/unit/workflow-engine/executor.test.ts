import {
  type WorkflowGraph,
  type WorkflowNodeChangedPayload,
  type WorkflowNodeRun,
  type WorkflowRun,
} from "@nexora/contracts";
import { describe, expect, it } from "vitest";

import { forkJoin, graph, linear } from "./graph-fixtures";
import { type DomainEventInput } from "../../../src/modules/event-manager/domain-emitter";
import {
  executeWorkflow,
  type NodeContext,
  type NodeExecutors,
  type WorkflowRunStore,
} from "../../../src/modules/workflow-engine/executor";

const RUN_ID = "01JBBBBBBBBBBBBBBBBBBBBBBB";
const EXEC_ID = "01JAAAAAAAAAAAAAAAAAAAAAAA";
const VERSION_ID = "01JCCCCCCCCCCCCCCCCCCCCCCC";

interface Pending {
  ctx: NodeContext;
  resolve: (output: string | null) => void;
  reject: (err: Error) => void;
}

/** In-memory store + event recorder + controllable node executors. */
function harness() {
  const run: WorkflowRun = {
    id: RUN_ID,
    versionId: VERSION_ID,
    executionId: EXEC_ID,
    status: "pending",
    startedAt: null,
    endedAt: null,
  };
  const nodeRuns: WorkflowNodeRun[] = [];
  const events: DomainEventInput[] = [];
  const sleeps: number[] = [];
  const pending: Pending[] = [];
  const started: string[] = [];
  const waiters: (() => void)[] = [];
  const notify = () => waiters.splice(0).forEach((w) => w());

  const store: WorkflowRunStore = {
    updateRun: (_id, patch) => Object.assign(run, patch),
    insertNodeRun: (r) => nodeRuns.push({ ...r }),
    updateNodeRun: (id, patch) => Object.assign(nodeRuns.find((r) => r.id === id) ?? {}, patch),
  };
  const fake = (ctx: NodeContext) =>
    new Promise<{ output: string | null }>((resolve, reject) => {
      started.push(ctx.node.id);
      const p: Pending = {
        ctx,
        resolve: (output) => resolve({ output }),
        reject,
      };
      pending.push(p);
      ctx.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      notify();
    });
  const executors: NodeExecutors = {
    agent: fake,
    skill: fake,
    mcp_tool: fake,
    approval: (ctx) => {
      ctx.waiting();
      return fake(ctx);
    },
  };
  const until = async (cond: () => boolean) => {
    for (let i = 0; i < 200 && !cond(); i += 1) {
      await new Promise<void>((r) => {
        waiters.push(r);
        setTimeout(r, 5);
      });
    }
    expect(cond()).toBe(true);
  };
  const take = async (nodeId: string): Promise<Pending> => {
    await until(() => pending.some((p) => p.ctx.node.id === nodeId));
    const i = pending.findIndex((p) => p.ctx.node.id === nodeId);
    return pending.splice(i, 1)[0] as Pending;
  };
  const exec = (g: WorkflowGraph, opts: { signal?: AbortSignal; maxParallel?: number } = {}) =>
    executeWorkflow(
      {
        store,
        events: { event: (e) => void events.push(e), entity: () => undefined },
        executors,
        sleep: (ms) => {
          sleeps.push(ms);
          return Promise.resolve();
        },
        ...(opts.maxParallel === undefined ? {} : { maxParallel: opts.maxParallel }),
      },
      {
        run,
        graph: g,
        prompt: "ship the feature",
        signal: opts.signal ?? new AbortController().signal,
      },
    );
  const statusOf = (nodeId: string) =>
    nodeRuns.filter((r) => r.nodeId === nodeId).map((r) => r.status);
  const changes = () =>
    events
      .filter((e) => e.type === "workflow.node_changed")
      .map((e) => e.payload as WorkflowNodeChangedPayload);
  return { run, nodeRuns, events, sleeps, started, exec, take, until, statusOf, changes, pending };
}

describe("workflow executor (T124)", () => {
  it("runs a linear graph, persists node runs and emits started/node_changed/completed", async () => {
    const h = harness();
    const done = h.exec(linear());
    const a = await h.take("a");
    expect(h.run.status).toBe("running");
    expect(a.ctx.prompt).toBe("ship the feature");
    a.ctx.setSession("sess-1");
    a.resolve("all good");
    expect(await done).toBe("completed");
    expect(h.run).toMatchObject({ status: "completed" });
    expect(h.run.startedAt).not.toBeNull();
    expect(h.run.endedAt).not.toBeNull();
    expect(h.nodeRuns.find((r) => r.nodeId === "a")).toMatchObject({
      status: "completed",
      attempt: 1,
      sessionId: "sess-1",
      outputSummary: "all good",
    });
    expect(h.statusOf("end")).toEqual(["completed"]);
    const types = h.events.map((e) => e.type);
    expect(types[0]).toBe("workflow.started");
    expect(types.at(-1)).toBe("workflow.completed");
    expect(h.events.every((e) => e.executionId === EXEC_ID)).toBe(true);
    expect(h.changes()).toContainEqual({
      runId: RUN_ID,
      nodeId: "a",
      attempt: 1,
      status: "running",
    });
    expect(h.changes()).toContainEqual({
      runId: RUN_ID,
      nodeId: "a",
      attempt: 1,
      status: "completed",
    });
  });

  it("runs fork branches in parallel and waits at the join", async () => {
    const h = harness();
    const done = h.exec(forkJoin());
    await h.until(() => h.started.includes("a") && h.started.includes("b"));
    const a = await h.take("a");
    a.resolve("a done");
    await new Promise((r) => setTimeout(r, 10));
    expect(h.statusOf("join")).toEqual([]);
    (await h.take("b")).resolve("b done");
    expect(await done).toBe("completed");
    expect(h.statusOf("join")).toEqual(["completed"]);
  });

  it("caps parallel session nodes at maxParallel", async () => {
    const h = harness();
    const done = h.exec(forkJoin(), { maxParallel: 1 });
    await h.until(() => h.started.length === 1);
    await new Promise((r) => setTimeout(r, 10));
    expect(h.started).toHaveLength(1);
    (await h.take(h.started[0] as string)).resolve(null);
    await h.until(() => h.started.length === 2);
    (await h.take(h.started[1] as string)).resolve(null);
    expect(await done).toBe("completed");
  });

  const conditional = (expression: string): WorkflowGraph =>
    graph(
      [
        { id: "start", kind: "start" },
        { id: "a", kind: "agent" },
        { id: "c", kind: "condition", config: { expression } },
        { id: "yes", kind: "agent" },
        { id: "no", kind: "agent" },
        { id: "end", kind: "end" },
      ],
      ["start>a", "a>c", "c>yes:true", "c>no:false", "yes>end", "no>end"],
    );

  it("takes the condition branch and skips the other one", async () => {
    const h = harness();
    const done = h.exec(conditional('contains(nodes.a.output, "0 failed")'));
    (await h.take("a")).resolve("12 passed, 0 failed");
    (await h.take("yes")).resolve(null);
    expect(await done).toBe("completed");
    expect(h.statusOf("c")).toEqual(["completed"]);
    expect(h.nodeRuns.find((r) => r.nodeId === "c")?.outputSummary).toBe("true");
    expect(h.statusOf("no")).toEqual(["skipped"]);
    expect(h.started).not.toContain("no");

    const h2 = harness();
    const done2 = h2.exec(conditional('nodes.a.status == "failed"'));
    (await h2.take("a")).resolve("ok");
    (await h2.take("no")).resolve(null);
    expect(await done2).toBe("completed");
    expect(h2.statusOf("yes")).toEqual(["skipped"]);
  });

  it("waits for an approval node without any timeout", async () => {
    const g = graph(
      [
        { id: "start", kind: "start" },
        { id: "ok", kind: "approval" },
        { id: "end", kind: "end" },
      ],
      ["start>ok", "ok>end"],
    );
    const h = harness();
    const done = h.exec(g);
    const ok = await h.take("ok");
    expect(h.statusOf("ok")).toEqual(["waiting_for_approval"]);
    expect(h.run.status).toBe("waiting_for_approval");
    await new Promise((r) => setTimeout(r, 30));
    expect(h.run.status).toBe("waiting_for_approval");
    ok.resolve("approved");
    expect(await done).toBe("completed");
    expect(h.statusOf("ok")).toEqual(["completed"]);
  });

  it("retries a failing node with backoff up to maxAttempts", async () => {
    const g = linear();
    (g.nodes[1] as { retry: unknown }).retry = { maxAttempts: 3, backoffMs: 250 };
    const h = harness();
    const done = h.exec(g);
    (await h.take("a")).reject(new Error("flaky 1"));
    (await h.take("a")).reject(new Error("flaky 2"));
    const third = await h.take("a");
    expect(third.ctx.attempt).toBe(3);
    third.resolve("finally");
    expect(await done).toBe("completed");
    expect(h.statusOf("a")).toEqual(["failed", "failed", "completed"]);
    expect(h.nodeRuns.filter((r) => r.nodeId === "a").map((r) => r.attempt)).toEqual([1, 2, 3]);
    expect(h.nodeRuns.find((r) => r.nodeId === "a")?.error).toBe("flaky 1");
    expect(h.sleeps).toEqual([250, 250]);
  });

  it("fails the run when retries are exhausted with onError fail", async () => {
    const g = linear();
    (g.nodes[1] as { retry: unknown }).retry = { maxAttempts: 2, backoffMs: 0 };
    const h = harness();
    const done = h.exec(g);
    (await h.take("a")).reject(new Error("boom"));
    (await h.take("a")).reject(new Error("boom again"));
    expect(await done).toBe("failed");
    expect(h.run.status).toBe("failed");
    expect(h.statusOf("end")).toEqual([]);
    expect(h.events.at(-1)).toMatchObject({ type: "workflow.completed", severity: "error" });
  });

  it("onError continue goes on along the normal edges", async () => {
    const g = graph(
      [
        { id: "start", kind: "start" },
        { id: "a", kind: "agent", onError: "continue" },
        { id: "b", kind: "agent" },
        { id: "end", kind: "end" },
      ],
      ["start>a", "a>b", "b>end"],
    );
    const h = harness();
    const done = h.exec(g);
    (await h.take("a")).reject(new Error("lint failed"));
    (await h.take("b")).resolve(null);
    expect(await done).toBe("completed");
    expect(h.statusOf("a")).toEqual(["failed"]);
  });

  it("onError goto follows the error edge and skips the normal path", async () => {
    const g = graph(
      [
        { id: "start", kind: "start" },
        { id: "a", kind: "agent", onError: { goto: "fix" } },
        { id: "b", kind: "agent" },
        { id: "fix", kind: "agent" },
        { id: "end", kind: "end" },
      ],
      ["start>a", "a>b", "b>end", "fix>end"],
    );
    const h = harness();
    const done = h.exec(g);
    (await h.take("a")).reject(new Error("tests red"));
    (await h.take("fix")).resolve("fixed");
    expect(await done).toBe("completed");
    expect(h.statusOf("b")).toEqual(["skipped"]);
    expect(h.statusOf("fix")).toEqual(["completed"]);

    // success: the error target is skipped instead
    const h2 = harness();
    const done2 = h2.exec(g);
    (await h2.take("a")).resolve(null);
    (await h2.take("b")).resolve(null);
    expect(await done2).toBe("completed");
    expect(h2.statusOf("fix")).toEqual(["skipped"]);
  });

  it("a failed branch cancels its running sibling", async () => {
    const h = harness();
    const done = h.exec(forkJoin());
    await h.until(() => h.started.length === 2);
    (await h.take("a")).reject(new Error("broken"));
    expect(await done).toBe("failed");
    expect(h.statusOf("b")).toEqual(["cancelled"]);
  });

  it("cancellation stops running nodes and marks the run cancelled", async () => {
    const h = harness();
    const ctrl = new AbortController();
    const done = h.exec(forkJoin(), { signal: ctrl.signal });
    await h.until(() => h.started.length === 2);
    ctrl.abort();
    expect(await done).toBe("cancelled");
    expect(h.run.status).toBe("cancelled");
    expect(h.statusOf("a")).toEqual(["cancelled"]);
    expect(h.statusOf("b")).toEqual(["cancelled"]);
    expect(h.statusOf("join")).toEqual([]);
    expect(h.events.at(-1)).toMatchObject({ type: "workflow.completed" });
  });

  it("a condition that cannot be evaluated fails its node", async () => {
    const h = harness();
    const done = h.exec(conditional('nodes.ghost.status == "completed"'));
    (await h.take("a")).resolve(null);
    expect(await done).toBe("failed");
    expect(h.nodeRuns.find((r) => r.nodeId === "c")?.error).toMatch(/ghost/);
  });
});
