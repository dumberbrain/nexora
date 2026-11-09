import { type WorkflowGraph, type WorkflowNode, type WorkflowNodeKind } from "../model/types";

export const NODE_KIND_LABEL: Record<WorkflowNodeKind, string> = {
  start: "Start",
  end: "End",
  agent: "Agent",
  skill: "Skill",
  mcp_tool: "MCP tool",
  condition: "Condition",
  approval: "Approval",
  parallel_fork: "Parallel fork",
  parallel_join: "Parallel join",
};

/** Kinds the user adds from the palette — start/end exist once in every graph. */
export const PALETTE_KINDS = [
  "agent",
  "skill",
  "mcp_tool",
  "condition",
  "approval",
  "parallel_fork",
  "parallel_join",
] as const satisfies readonly WorkflowNodeKind[];

/** Kinds with no config, retry or error policy of their own. */
export const STRUCTURAL_KINDS: ReadonlySet<WorkflowNodeKind> = new Set([
  "start",
  "end",
  "parallel_fork",
  "parallel_join",
]);

/**
 * Starting config of a freshly added node. Required text is left empty on purpose: the server
 * validation flags it (`invalid_config`) until the user fills the property panel.
 */
export function defaultNodeConfig(kind: WorkflowNodeKind): Record<string, unknown> {
  switch (kind) {
    case "agent":
      return { role: "implementer", prompt: "", ownedPaths: [] };
    case "skill":
      return { skill: "", args: "" };
    case "mcp_tool":
      return { server: "", tool: "", prompt: "" };
    case "condition":
      return { expression: "" };
    case "approval":
      return { message: "", riskClass: "normal" };
    default:
      return {};
  }
}

export function makeNode(
  kind: WorkflowNodeKind,
  id: string,
  position: WorkflowNode["position"],
  label = NODE_KIND_LABEL[kind],
): WorkflowNode {
  return {
    id,
    kind,
    label,
    config: defaultNodeConfig(kind),
    retry: { maxAttempts: 1, backoffMs: 0 },
    onError: "fail",
    position,
  };
}

/** The graph of a new workflow: start → end. */
export function defaultGraph(): WorkflowGraph {
  return {
    nodes: [makeNode("start", "start", { x: 0, y: 0 }), makeNode("end", "end", { x: 0, y: 240 })],
    edges: [{ id: "e-start-end", source: "start", target: "end" }],
  };
}
