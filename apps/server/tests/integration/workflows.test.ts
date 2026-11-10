import {
  ApprovalListSchema,
  ExecutionSchema,
  GraphValidationSchema,
  type UbulieraEvent,
  RunWorkflowResultSchema,
  type WorkflowGraph,
  WorkflowDetailSchema,
  WorkflowListSchema,
  type WorkflowNodeChangedPayload,
  WorkflowRunDetailSchema,
  WorkflowVersionListSchema,
  WorkflowVersionSchema,
} from "@ubuliera/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HOST, login } from "../helpers/us1";
import { createUs5Harness, type Us5Harness } from "../helpers/us5";

let h: Us5Harness;
let auth: { cookie: string; csrf: string };
let projectId: string;
let events: UbulieraEvent[];

beforeEach(async () => {
  h = await createUs5Harness({ sessionRows: true });
  auth = await login(h.app);
  projectId = (await h.services.projects.register({ rootPath: h.root }, "user")).id;
  events = [];
  h.bus.onEvent((e) => events.push(e));
});
afterEach(() => h.close());

const get = (path: string) =>
  h.app.request(`/api/v1${path}`, { headers: { ...HOST, cookie: auth.cookie } });
const post = (path: string, body?: unknown) =>
  h.app.request(`/api/v1${path}`, {
    method: "POST",
    headers: {
      ...HOST,
      cookie: auth.cookie,
      "content-type": "application/json",
      "x-ubuliera-csrf": auth.csrf,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const json = async (res: Response): Promise<unknown> => await res.json();

const pos = { x: 0, y: 0 };
const agent = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: "agent",
  label: id,
  config: { role: "backend-developer", prompt: `do ${id}` },
  position: pos,
  ...extra,
});
const bare = (id: string, kind: string) => ({ id, kind, label: id, config: {}, position: pos });
const edge = (source: string, target: string) => ({
  id: `${source}-${target}`,
  source,
  target,
});

/** start → fork → (a ∥ b) → join → approval → c (retry 2) → end */
function parallelGraph(label = "c") {
  return {
    nodes: [
      bare("start", "start"),
      bare("fork", "parallel_fork"),
      agent("a"),
      agent("b"),
      bare("join", "parallel_join"),
      {
        id: "ok",
        kind: "approval",
        label: "Approve",
        config: { message: "Continue?", riskClass: "normal" },
        position: pos,
      },
      agent("c", { label, retry: { maxAttempts: 2, backoffMs: 0 } }),
      bare("end", "end"),
    ],
    edges: [
      edge("start", "fork"),
      edge("fork", "a"),
      edge("fork", "b"),
      edge("a", "join"),
      edge("b", "join"),
      edge("join", "ok"),
      edge("ok", "c"),
      edge("c", "end"),
    ],
  };
}

async function createWorkflow(graph: unknown, name = "Parallel review") {
  const res = await post("/workflows", { name, description: "test", graph });
  expect(res.status).toBe(201);
  return WorkflowDetailSchema.parse(await json(res));
}

async function runDetail(executionId: string) {
  return WorkflowRunDetailSchema.parse(
    await json(await get(`/executions/${executionId}/workflow-run`)),
  );
}
async function execution(id: string) {
  return ExecutionSchema.parse(await json(await get(`/executions/${id}`)));
}
const nodeStatus = async (executionId: string, nodeId: string) =>
  (await runDetail(executionId)).nodes.find((n) => n.nodeId === nodeId);

describe("workflows API (T129)", () => {
  it("seeds the three built-in templates once", async () => {
    const list = WorkflowListSchema.parse(await json(await get("/workflows")));
    const builtIn = list.items.filter((w) => w.builtIn);
    expect(builtIn.map((w) => w.name).sort()).toEqual([
      "Review and merge",
      "Spec-driven feature",
      "TDD feature",
    ]);
    expect(builtIn.every((w) => w.latestVersion === 1)).toBe(true);
    h.workflows.seed();
    expect(WorkflowListSchema.parse(await json(await get("/workflows"))).items).toHaveLength(3);
    const detail = WorkflowDetailSchema.parse(
      await json(await get(`/workflows/${builtIn[0]?.id ?? ""}`)),
    );
    expect(detail.latest?.graph.nodes.length).toBeGreaterThan(2);
  });

  it("creates, saves v2 immutably and keeps v1 runnable", async () => {
    const created = await createWorkflow(parallelGraph());
    expect(created).toMatchObject({ latestVersion: 1, builtIn: false });
    const v2res = await post(`/workflows/${created.id}/versions`, {
      graph: parallelGraph("c (v2)"),
    });
    expect(v2res.status).toBe(201);
    const v2 = WorkflowVersionSchema.parse(await json(v2res));
    expect(v2.version).toBe(2);

    const versions = WorkflowVersionListSchema.parse(
      await json(await get(`/workflows/${created.id}/versions`)),
    );
    expect(versions.items.map((v) => v.version)).toEqual([2, 1]);
    expect(versions.items[0]).not.toHaveProperty("graph");
    const detail = WorkflowDetailSchema.parse(await json(await get(`/workflows/${created.id}`)));
    expect(detail.latest?.version).toBe(2);

    // an older version stays readable with its own graph
    const v1 = WorkflowVersionSchema.parse(
      await json(await get(`/workflows/${created.id}/versions/1`)),
    );
    expect(v1.version).toBe(1);
    expect(v1.graph.nodes.find((n) => n.id === "c")?.label).toBe("c");
    expect((await get(`/workflows/${created.id}/versions/9`)).status).toBe(404);
    expect((await get(`/workflows/${created.id}/versions/x`)).status).toBe(404);

    const res = await post(`/workflows/${created.id}/versions/1/run`, { projectId });
    expect(res.status).toBe(201);
    const { executionId, run } = RunWorkflowResultSchema.parse(await json(res));
    expect(run.versionId).toBe(created.latest?.id);
    const d = await runDetail(executionId);
    expect(d.version.version).toBe(1);
    expect(d.version.graph.nodes.find((n) => n.id === "c")?.label).toBe("c");
  });

  it("runs parallel nodes, waits for approval, honours retry and reports the run", async () => {
    const wf = await createWorkflow(parallelGraph());
    const res = await post(`/workflows/${wf.id}/versions/1/run`, {
      projectId,
      prompt: "Review the auth module",
    });
    const { executionId, run } = RunWorkflowResultSchema.parse(await json(res));
    expect(run.executionId).toBe(executionId);

    const e = await execution(executionId);
    expect(e).toMatchObject({ mode: "workflow", status: "running" });
    expect(e.worktreePath).toContain(executionId);

    // a and b run at the same time, in the execution worktree
    await vi.waitFor(() => expect(h.runtime.sessions).toHaveLength(2));
    for (const s of h.runtime.sessions) {
      expect(s.input).toMatchObject({
        executionId,
        executionMode: "workflow",
        cwd: e.worktreePath,
        taskId: null,
      });
      expect(s.input.prompt).toContain("Review the auth module");
    }
    const running = await runDetail(executionId);
    expect(
      running.nodes
        .filter((n) => n.status === "running")
        .map((n) => n.nodeId)
        .sort(),
    ).toEqual(["a", "b"]);
    expect(running.nodes.find((n) => n.nodeId === "a")?.sessionId).toBe(h.runtime.sessions[0]?.id);

    h.runtime.sessions[0]?.finish("completed", "a ok");
    await vi.waitFor(async () =>
      expect((await nodeStatus(executionId, "a"))?.status).toBe("completed"),
    );
    expect(await nodeStatus(executionId, "join")).toBeUndefined();
    h.runtime.sessions[1]?.finish("completed", "b ok");

    // approval waits for a human
    await vi.waitFor(async () => {
      const pending = ApprovalListSchema.parse(await json(await get("/approvals?status=pending")));
      expect(pending.items.filter((a) => a.action === "workflow.approval")).toHaveLength(1);
    });
    expect((await runDetail(executionId)).run.status).toBe("waiting_for_approval");
    expect((await nodeStatus(executionId, "ok"))?.status).toBe("waiting_for_approval");
    expect(h.runtime.sessions).toHaveLength(2);
    const pending = ApprovalListSchema.parse(await json(await get("/approvals?status=pending")));
    const approval = pending.items.find((a) => a.action === "workflow.approval");
    expect(approval?.executionId).toBe(executionId);
    const decided = await post(`/approvals/${approval?.id ?? ""}/decision`, {
      decision: "approve",
    });
    expect(decided.status).toBe(200);

    // c fails once and is retried
    await vi.waitFor(() => expect(h.runtime.sessions).toHaveLength(3));
    h.runtime.sessions[2]?.finish("failed", null, "flaky tool");
    await vi.waitFor(() => expect(h.runtime.sessions).toHaveLength(4));
    h.runtime.sessions[3]?.finish("completed", "c ok");

    await vi.waitFor(async () => expect((await execution(executionId)).status).toBe("completed"));
    const done = await runDetail(executionId);
    expect(done.run.status).toBe("completed");
    expect(done.run.endedAt).not.toBeNull();
    expect(done.nodes).toHaveLength(8);
    expect(done.nodes.find((n) => n.nodeId === "c")).toMatchObject({
      attempt: 2,
      status: "completed",
      outputSummary: "c ok",
    });
    expect(done.nodes.every((n) => n.status === "completed")).toBe(true);

    const types = events.filter((ev) => ev.executionId === executionId).map((ev) => ev.type);
    expect(types).toContain("workflow.started");
    expect(types).toContain("workflow.completed");
    const changed = events
      .filter((ev) => ev.type === "workflow.node_changed")
      .map((ev) => ev.payload as WorkflowNodeChangedPayload);
    expect(changed).toContainEqual({ runId: run.id, nodeId: "c", attempt: 1, status: "failed" });
    expect(changed).toContainEqual({ runId: run.id, nodeId: "c", attempt: 2, status: "completed" });
  });

  it("stop cancels the run and its sessions; hold is not offered", async () => {
    const wf = await createWorkflow({
      nodes: [bare("start", "start"), agent("a"), bare("end", "end")],
      edges: [edge("start", "a"), edge("a", "end")],
    });
    const { executionId } = RunWorkflowResultSchema.parse(
      await json(await post(`/workflows/${wf.id}/versions/1/run`, { projectId })),
    );
    await vi.waitFor(() => expect(h.runtime.sessions).toHaveLength(1));
    await vi.waitFor(async () =>
      expect((await nodeStatus(executionId, "a"))?.sessionId).not.toBeNull(),
    );

    const paused = await post(`/executions/${executionId}/pause`);
    expect(paused.status).toBe(422);

    const stopped = await post(`/executions/${executionId}/stop`);
    expect(stopped.status).toBe(200);
    expect(ExecutionSchema.parse(await json(stopped)).status).toBe("cancelled");
    expect(h.runtime.sessions[0]?.stopped).toBe(true);
    const d = await runDetail(executionId);
    expect(d.run.status).toBe("cancelled");
    expect(d.nodes.find((n) => n.nodeId === "a")?.status).toBe("cancelled");
    expect(d.nodes.find((n) => n.nodeId === "end")).toBeUndefined();
  });

  it("runs skill and MCP tool nodes through managed sessions", async () => {
    const wf = await createWorkflow({
      nodes: [
        bare("start", "start"),
        {
          id: "notes",
          kind: "skill",
          label: "Release notes",
          config: { skill: "release-notes", args: "for v2" },
          position: pos,
        },
        {
          id: "db",
          kind: "mcp_tool",
          label: "Count users",
          config: { server: "postgres", tool: "query", prompt: "count the users" },
          position: pos,
        },
        bare("end", "end"),
      ],
      edges: [edge("start", "notes"), edge("notes", "db"), edge("db", "end")],
    });
    const { executionId } = RunWorkflowResultSchema.parse(
      await json(await post(`/workflows/${wf.id}/versions/1/run`, { projectId })),
    );
    await vi.waitFor(() => expect(h.runtime.sessions).toHaveLength(1));
    expect(h.runtime.sessions[0]?.input.prompt).toBe("/release-notes for v2");
    h.runtime.sessions[0]?.finish("completed", "notes written");
    await vi.waitFor(() => expect(h.runtime.sessions).toHaveLength(2));
    expect(h.runtime.sessions[1]?.input.allowedTools).toEqual(["mcp__postgres__query"]);
    expect(h.runtime.sessions[1]?.input.prompt).toContain("count the users");
    h.runtime.sessions[1]?.finish("completed", "42");
    await vi.waitFor(async () => expect((await execution(executionId)).status).toBe("completed"));
  });

  it("rejects invalid graphs with the validation issues", async () => {
    const bad = {
      nodes: [bare("start", "start"), agent("a"), agent("orphan"), bare("end", "end")],
      edges: [edge("start", "a"), edge("a", "end"), edge("orphan", "end")],
    };
    const validated = GraphValidationSchema.parse(
      await json(await post("/workflows/validate", { graph: bad })),
    );
    expect(validated.valid).toBe(false);
    expect(validated.issues).toContainEqual(
      expect.objectContaining({ code: "unreachable_node", ref: "orphan" }),
    );

    const res = await post("/workflows", { name: "Broken", graph: bad });
    expect(res.status).toBe(400);
    const body = (await json(res)) as { error: { code: string; details: unknown[] } };
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(body.error.details).toContainEqual(
      expect.objectContaining({ code: "unreachable_node", ref: "orphan" }),
    );

    const unknownSkill: WorkflowGraph = {
      nodes: [
        {
          ...bare("start", "start"),
          retry: { maxAttempts: 1, backoffMs: 0 },
          onError: "fail",
          kind: "start",
        },
        {
          id: "s",
          kind: "skill",
          label: "s",
          config: { skill: "does-not-exist", args: "" },
          position: pos,
          retry: { maxAttempts: 1, backoffMs: 0 },
          onError: "fail",
        },
        {
          ...bare("end", "end"),
          retry: { maxAttempts: 1, backoffMs: 0 },
          onError: "fail",
          kind: "end",
        },
      ],
      edges: [edge("start", "s"), edge("s", "end")],
    };
    const v = GraphValidationSchema.parse(
      await json(await post("/workflows/validate", { graph: unknownSkill })),
    );
    expect(v.issues).toContainEqual(
      expect.objectContaining({ code: "unknown_reference", ref: "s" }),
    );

    const wf = await createWorkflow({
      nodes: [bare("start", "start"), agent("a"), bare("end", "end")],
      edges: [edge("start", "a"), edge("a", "end")],
    });
    const tooMany = {
      nodes: [
        bare("start", "start"),
        agent("a", { retry: { maxAttempts: 9 } }),
        bare("end", "end"),
      ],
      edges: [edge("start", "a"), edge("a", "end")],
    };
    expect((await post(`/workflows/${wf.id}/versions`, { graph: tooMany })).status).toBe(400);
    expect(
      WorkflowVersionListSchema.parse(await json(await get(`/workflows/${wf.id}/versions`))).items,
    ).toHaveLength(1);
  });

  it("answers 404 for unknown workflows, versions and non-workflow executions", async () => {
    const wf = await createWorkflow({
      nodes: [bare("start", "start"), agent("a"), bare("end", "end")],
      edges: [edge("start", "a"), edge("a", "end")],
    });
    expect((await get("/workflows/01JAAAAAAAAAAAAAAAAAAAAAAA")).status).toBe(404);
    expect((await get("/workflows/not-an-id")).status).toBe(404);
    expect((await post(`/workflows/${wf.id}/versions/7/run`, { projectId })).status).toBe(404);
    const plain = ExecutionSchema.parse(
      await json(await post("/executions", { projectId, prompt: "Refactor the logger" })),
    );
    expect((await get(`/executions/${plain.id}/workflow-run`)).status).toBe(404);
  });
});
