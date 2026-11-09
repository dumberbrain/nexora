import {
  type ApiErrorBody,
  type CreateWorkflowInput,
  type GraphIssue,
  type GraphValidation,
  NODE_CONFIG_SCHEMAS,
  type RunWorkflowResult,
  type WorkflowDetail,
  type WorkflowGraph,
  type WorkflowNodeRun,
  type WorkflowRunDetail,
  type WorkflowSummary,
  type WorkflowVersion,
} from "@nexora/contracts";
import { http, HttpResponse } from "msw";

const NOW = Date.UTC(2026, 10, 9, 12, 0, 0);
const W1 = "01JCXK0000000000000000W001";
const W2 = "01JCXK0000000000000000W002";
const RUN = "01JCXK0000000000000000R001";
export const WORKFLOW_EXECUTION_ID = "01JCXK0000000000000000X004";

const node = (
  id: string,
  kind: WorkflowGraph["nodes"][number]["kind"],
  label: string,
  y: number,
  config: Record<string, unknown> = {},
): WorkflowGraph["nodes"][number] => ({
  id,
  kind,
  label,
  config,
  retry: { maxAttempts: 1, backoffMs: 0 },
  onError: "fail",
  position: { x: 0, y },
});

/** start → Implement → Tests pass? —true→ Ship it? → end; —false→ end */
export const workflowGraphFixture: WorkflowGraph = {
  nodes: [
    node("start", "start", "Start", 0),
    node("agent-1", "agent", "Implement", 120, {
      role: "implementer",
      prompt: "Implement the feature",
      ownedPaths: [],
    }),
    node("condition-1", "condition", "Tests pass?", 240, {
      expression: 'nodes["agent-1"].status == "completed"',
    }),
    node("approval-1", "approval", "Ship it?", 360, { message: "Merge?", riskClass: "normal" }),
    node("end", "end", "End", 480),
  ],
  edges: [
    { id: "e-start-agent-1", source: "start", target: "agent-1" },
    { id: "e-agent-1-condition-1", source: "agent-1", target: "condition-1" },
    { id: "e-c-true", source: "condition-1", target: "approval-1", branch: "true" },
    { id: "e-c-false", source: "condition-1", target: "end", branch: "false" },
    { id: "e-approval-1-end", source: "approval-1", target: "end" },
  ],
};

const version = (definitionId: string, v: number, graph: WorkflowGraph): WorkflowVersion => ({
  id: `01JCXK00000000000000V${definitionId.slice(-3)}0${v}`.slice(0, 26),
  definitionId,
  version: v,
  graph,
  createdAt: NOW - 60_000 + v,
});

const summaries: WorkflowSummary[] = [
  {
    id: W1,
    name: "Feature pipeline",
    description: "Implement, gate on tests, approve",
    createdAt: NOW - 86_400_000,
    latestVersion: 1,
    builtIn: false,
  },
  {
    id: W2,
    name: "spec-driven",
    description: "Built-in spec-kit flow",
    createdAt: NOW - 172_800_000,
    latestVersion: 1,
    builtIn: true,
  },
];
export const workflowFixtures = summaries;

let versions = new Map<string, WorkflowVersion[]>();
export function resetWorkflows(): void {
  versions = new Map([
    [W1, [version(W1, 1, workflowGraphFixture)]],
    [W2, [version(W2, 1, workflowGraphFixture)]],
  ]);
}
resetWorkflows();

/** The test double of the server graph validator: per-kind config + exactly one start. */
export function validateGraphFixture(graph: WorkflowGraph): GraphValidation {
  const issues: GraphIssue[] = graph.nodes.flatMap((n) =>
    NODE_CONFIG_SCHEMAS[n.kind].safeParse(n.config).success
      ? []
      : [
          {
            ref: n.id,
            code: "invalid_config" as const,
            message: `${n.label}: config is incomplete`,
          },
        ],
  );
  if (graph.nodes.filter((n) => n.kind === "start").length !== 1) {
    issues.push({ ref: null, code: "start_count", message: "Exactly one start node is required" });
  }
  return { valid: issues.length === 0, issues };
}

const nodeRun = (nodeId: string, status: WorkflowNodeRun["status"], attempt = 1) => ({
  id: `01JCXK00000000000000NR${nodeId.slice(0, 4).toUpperCase()}`.padEnd(26, "0").slice(0, 26),
  runId: RUN,
  nodeId,
  attempt,
  status,
  sessionId: null,
  outputSummary: status === "completed" ? `${nodeId} done` : null,
  error: null,
});

export const workflowRunFixture: WorkflowRunDetail = {
  run: {
    id: RUN,
    versionId: version(W1, 1, workflowGraphFixture).id,
    executionId: WORKFLOW_EXECUTION_ID,
    status: "waiting_for_approval",
    startedAt: NOW - 30_000,
    endedAt: null,
  },
  version: version(W1, 1, workflowGraphFixture),
  nodes: [
    nodeRun("start", "completed"),
    nodeRun("agent-1", "completed", 2),
    nodeRun("condition-1", "completed"),
    nodeRun("approval-1", "waiting_for_approval"),
    nodeRun("end", "pending"),
  ],
};

const notFound: ApiErrorBody = { error: { code: "NOT_FOUND", message: "workflow not found" } };

const detailOf = (s: WorkflowSummary): WorkflowDetail => {
  const list = versions.get(s.id) ?? [];
  const latest = list.at(-1) ?? null;
  return { ...s, latestVersion: latest?.version ?? null, latest };
};

export const workflowHandlers = [
  http.get("*/api/v1/workflows", () =>
    HttpResponse.json({
      items: summaries.map((s) => ({ ...s, latestVersion: detailOf(s).latestVersion })),
    }),
  ),
  http.post("*/api/v1/workflows", async ({ request }) => {
    const body = (await request.json()) as CreateWorkflowInput;
    const id = "01JCXK0000000000000000W009";
    if (body.graph) versions.set(id, [version(id, 1, body.graph)]);
    const summary = { id, name: body.name, description: body.description ?? "", createdAt: NOW };
    return HttpResponse.json<WorkflowDetail>(
      detailOf({ ...summary, latestVersion: null, builtIn: false }),
      { status: 201 },
    );
  }),
  http.post("*/api/v1/workflows/validate", async ({ request }) => {
    const { graph } = (await request.json()) as { graph: WorkflowGraph };
    return HttpResponse.json<GraphValidation>(validateGraphFixture(graph));
  }),
  http.get("*/api/v1/workflows/:id", ({ params }) => {
    const s = summaries.find((w) => w.id === params.id);
    return s ? HttpResponse.json(detailOf(s)) : HttpResponse.json(notFound, { status: 404 });
  }),
  http.get("*/api/v1/workflows/:id/versions", ({ params }) => {
    const list = versions.get(String(params.id)) ?? [];
    return HttpResponse.json({ items: [...list].reverse().map(({ graph: _g, ...v }) => v) });
  }),
  http.get("*/api/v1/workflows/:id/versions/:v", ({ params }) => {
    const found = versions.get(String(params.id))?.find((v) => v.version === Number(params.v));
    return found ? HttpResponse.json(found) : HttpResponse.json(notFound, { status: 404 });
  }),
  http.post("*/api/v1/workflows/:id/versions", async ({ params, request }) => {
    const list = versions.get(String(params.id));
    if (!list) return HttpResponse.json(notFound, { status: 404 });
    const { graph } = (await request.json()) as { graph: WorkflowGraph };
    const validation = validateGraphFixture(graph);
    if (!validation.valid) {
      const body: ApiErrorBody = {
        error: { code: "VALIDATION_FAILED", message: "graph is invalid", details: [validation] },
      };
      return HttpResponse.json(body, { status: 400 });
    }
    const saved = version(String(params.id), list.length + 1, graph);
    list.push(saved);
    return HttpResponse.json(saved, { status: 201 });
  }),
  http.post("*/api/v1/workflows/:id/versions/:v/run", () =>
    HttpResponse.json<RunWorkflowResult>(
      { executionId: WORKFLOW_EXECUTION_ID, run: workflowRunFixture.run },
      { status: 201 },
    ),
  ),
  http.get("*/api/v1/executions/:id/workflow-run", () =>
    HttpResponse.json<WorkflowRunDetail>(workflowRunFixture),
  ),
];
