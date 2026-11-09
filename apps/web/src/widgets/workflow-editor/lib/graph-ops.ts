import {
  makeNode,
  NODE_KIND_LABEL,
  type WorkflowEdge,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowNodeKind,
} from "@/entities/workflow";

/** Pure, immutable graph edits — the draft hook and the tests share them. */

const FIXED: ReadonlySet<WorkflowNodeKind> = new Set(["start", "end"]);
const ROW = 120;

type Branch = NonNullable<WorkflowEdge["branch"]>;

export function addNode(
  graph: WorkflowGraph,
  kind: WorkflowNodeKind,
): { graph: WorkflowGraph; id: string } {
  const taken = new Set(graph.nodes.map((n) => n.id));
  let n = 1;
  while (taken.has(`${kind}-${n}`)) n++;
  const id = `${kind}-${n}`;
  const lowest = Math.max(0, ...graph.nodes.map((node) => node.position.y));
  const node = makeNode(kind, id, { x: 220, y: lowest + ROW }, `${NODE_KIND_LABEL[kind]} ${n}`);
  return { graph: { ...graph, nodes: [...graph.nodes, node] }, id };
}

export function updateNode(
  graph: WorkflowGraph,
  id: string,
  patch: Partial<Omit<WorkflowNode, "id" | "kind">>,
): WorkflowGraph {
  return { ...graph, nodes: graph.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) };
}

/** Removes a node with its edges; `goto` error paths into it fall back to `fail`. */
export function removeNode(graph: WorkflowGraph, id: string): WorkflowGraph {
  const node = graph.nodes.find((n) => n.id === id);
  if (!node || FIXED.has(node.kind)) return graph;
  return {
    nodes: graph.nodes
      .filter((n) => n.id !== id)
      .map((n) =>
        typeof n.onError === "object" && n.onError.goto === id ? { ...n, onError: "fail" } : n,
      ),
    edges: graph.edges.filter((e) => e.source !== id && e.target !== id),
  };
}

/** The branch the next edge out of a condition takes, or null when both exist. */
export function nextBranch(graph: WorkflowGraph, source: string): Branch | null {
  const used = new Set(graph.edges.filter((e) => e.source === source).map((e) => e.branch));
  if (!used.has("true")) return "true";
  return used.has("false") ? null : "false";
}

export const isCondition = (graph: WorkflowGraph, id: string) =>
  graph.nodes.some((n) => n.id === id && n.kind === "condition");

/** Adds source → target (condition sources get a true/false branch). No-op when invalid. */
export function connect(
  graph: WorkflowGraph,
  source: string,
  target: string,
  branch?: Branch,
): WorkflowGraph {
  if (source === target) return graph;
  if (graph.edges.some((e) => e.source === source && e.target === target)) return graph;
  let edge: WorkflowEdge = { id: `e-${source}-${target}`, source, target };
  if (isCondition(graph, source)) {
    const used = graph.edges.some((e) => e.source === source && e.branch === branch);
    const chosen = branch && !used ? branch : nextBranch(graph, source);
    if (!chosen) return graph;
    edge = { ...edge, branch: chosen };
  }
  return { ...graph, edges: [...graph.edges, edge] };
}

export function removeEdge(graph: WorkflowGraph, id: string): WorkflowGraph {
  return { ...graph, edges: graph.edges.filter((e) => e.id !== id) };
}

export function moveNode(
  graph: WorkflowGraph,
  id: string,
  position: WorkflowNode["position"],
): WorkflowGraph {
  return updateNode(graph, id, { position });
}
