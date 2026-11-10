import { type WorkflowEdge, type WorkflowGraph, type WorkflowNode } from "@ubuliera/contracts";

/** Small builders for workflow graphs in tests. */
export type NodeSpec = Partial<WorkflowNode> & Pick<WorkflowNode, "id" | "kind">;

const DEFAULT_CONFIG: Partial<Record<WorkflowNode["kind"], Record<string, unknown>>> = {
  agent: { role: "backend-developer", prompt: "do the work", ownedPaths: [] },
  skill: { skill: "release-notes", args: "" },
  mcp_tool: { server: "postgres", tool: "query", prompt: "count users" },
  condition: { expression: 'nodes.a.status == "completed"' },
  approval: { message: "ship it?", riskClass: "normal" },
};

export function node(spec: NodeSpec): WorkflowNode {
  return {
    label: spec.id,
    config: DEFAULT_CONFIG[spec.kind] ?? {},
    retry: { maxAttempts: 1, backoffMs: 0 },
    onError: "fail",
    position: { x: 0, y: 0 },
    ...spec,
  };
}

/** "a>b" or "c>d:true" (condition branch) */
export function edges(...specs: string[]): WorkflowEdge[] {
  return specs.map((s, i) => {
    const [pair, branch] = s.split(":") as [string, string | undefined];
    const [source, target] = pair.split(">") as [string, string];
    return {
      id: `e${i}-${source}-${target}`,
      source,
      target,
      ...(branch === "true" || branch === "false" ? { branch } : {}),
    };
  });
}

export function graph(nodes: NodeSpec[], edgeSpecs: string[]): WorkflowGraph {
  return { nodes: nodes.map(node), edges: edges(...edgeSpecs) };
}

/** start → a → end */
export const linear = (): WorkflowGraph =>
  graph(
    [
      { id: "start", kind: "start" },
      { id: "a", kind: "agent" },
      { id: "end", kind: "end" },
    ],
    ["start>a", "a>end"],
  );

/** start → fork → (a, b) → join → end */
export const forkJoin = (): WorkflowGraph =>
  graph(
    [
      { id: "start", kind: "start" },
      { id: "fork", kind: "parallel_fork" },
      { id: "a", kind: "agent" },
      { id: "b", kind: "agent" },
      { id: "join", kind: "parallel_join" },
      { id: "end", kind: "end" },
    ],
    ["start>fork", "fork>a", "fork>b", "a>join", "b>join", "join>end"],
  );
