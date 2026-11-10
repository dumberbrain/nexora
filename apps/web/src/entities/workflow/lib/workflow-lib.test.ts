import { type UbulieraEvent, type WorkflowRunDetail } from "@ubuliera/contracts";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/shared/api";

import { graphIssuesFromError } from "./graph-issues";
import { defaultGraph, defaultNodeConfig } from "./node-kinds";
import { applyNodeChanged, NODE_RUN_STATUS_LABEL, parseNodeChanged } from "./node-run";
import { makeEvent } from "../../../../tests/msw/handlers";
import { workflowKeys, workflowRunKeys } from "../api/query-keys";

const RUN = "01JCXK0000000000000000R001";
const VER = "01JCXK0000000000000000V001";
const DEF = "01JCXK0000000000000000W001";
const EXEC = "01JCXK0000000000000000X009";

const detail: WorkflowRunDetail = {
  run: {
    id: RUN,
    versionId: VER,
    executionId: EXEC,
    status: "running",
    startedAt: 1,
    endedAt: null,
  },
  version: { id: VER, definitionId: DEF, version: 1, graph: defaultGraph(), createdAt: 1 },
  nodes: [
    {
      id: "01JCXK0000000000000000N001",
      runId: RUN,
      nodeId: "start",
      attempt: 1,
      status: "running",
      sessionId: null,
      outputSummary: null,
      error: null,
    },
  ],
};

const event = (payload: unknown): UbulieraEvent =>
  makeEvent({
    id: "01JCXK0000000000000000E001",
    type: "workflow.node_changed",
    executionId: EXEC,
    summary: "node changed",
    payload,
  });

describe("workflow keys", () => {
  it("follow the shared entity-key convention", () => {
    expect(workflowKeys.lists()).toEqual(["workflows", "list"]);
    expect(workflowKeys.detail("W1")).toEqual(["workflows", "detail", "W1"]);
    expect(workflowKeys.versions("W1")).toEqual(["workflows", "detail", "W1", "versions"]);
    expect(workflowKeys.version("W1", 2)).toEqual(["workflows", "detail", "W1", "versions", 2]);
    expect(workflowRunKeys.byExecution("X1")).toEqual(["workflow-runs", "execution", "X1"]);
  });
});

describe("defaultGraph", () => {
  it("has a start and an end connected by one edge", () => {
    const g = defaultGraph();
    expect(g.nodes.map((n) => n.kind)).toEqual(["start", "end"]);
    expect(g.edges).toEqual([{ id: "e-start-end", source: "start", target: "end" }]);
  });

  it("gives every kind a config shape (empty for structural nodes)", () => {
    expect(defaultNodeConfig("parallel_fork")).toEqual({});
    expect(defaultNodeConfig("approval")).toMatchObject({ riskClass: "normal" });
    expect(defaultNodeConfig("agent")).toMatchObject({ ownedPaths: [] });
  });
});

describe("graphIssuesFromError", () => {
  const issue = { ref: "agent-1", code: "invalid_config" as const, message: "prompt is required" };
  it("reads wrapped GraphValidation details and bare issues of a 400 VALIDATION_FAILED", () => {
    const wrapped = new ApiError("VALIDATION_FAILED", "bad", 400, [
      { valid: false, issues: [issue] },
    ]);
    expect(graphIssuesFromError(wrapped)).toEqual([issue]);
    expect(graphIssuesFromError(new ApiError("VALIDATION_FAILED", "bad", 400, [issue]))).toEqual([
      issue,
    ]);
  });
  it("ignores other errors", () => {
    expect(graphIssuesFromError(new ApiError("CONFLICT", "x", 409, [issue]))).toEqual([]);
    expect(graphIssuesFromError(new Error("x"))).toEqual([]);
  });
});

describe("node runs", () => {
  it("parses only well-formed workflow.node_changed payloads", () => {
    const ok = event({ runId: RUN, nodeId: "start", attempt: 1, status: "completed" });
    expect(parseNodeChanged(ok)).toMatchObject({ nodeId: "start", status: "completed" });
    expect(parseNodeChanged(event({ nodeId: "start" }))).toBeNull();
    expect(parseNodeChanged({ ...ok, type: "task.started" })).toBeNull();
  });

  it("patches a known node in place and reports unknown nodes", () => {
    const next = applyNodeChanged(detail, {
      runId: RUN,
      nodeId: "start",
      attempt: 2,
      status: "failed",
    });
    expect(next.patched).toBe(true);
    expect(next.detail.nodes[0]).toMatchObject({ attempt: 2, status: "failed", error: null });
    const miss = applyNodeChanged(detail, {
      runId: RUN,
      nodeId: "x",
      attempt: 1,
      status: "running",
    });
    expect(miss.patched).toBe(false);
    expect(miss.detail).toBe(detail);
  });

  it("labels every node-run status", () => {
    expect(NODE_RUN_STATUS_LABEL.skipped).toBe("Skipped");
    expect(NODE_RUN_STATUS_LABEL.waiting_for_approval).toBe("Waiting for approval");
  });
});
