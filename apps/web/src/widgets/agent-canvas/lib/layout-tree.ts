export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 112;
const GAP_X = 32;
const GAP_Y = 72;
/** extra horizontal space between separate trees (sessions), in leaf slots */
const TREE_GAP_SLOTS = 0.5;

export type LayoutAgent = { id: string; parentAgentId: string | null; sessionId: string };
export type LayoutNode = { id: string; x: number; y: number; depth: number };
export type LayoutEdge = { id: string; source: string; target: string };

const byKey = (a: LayoutAgent, b: LayoutAgent) =>
  a.sessionId === b.sessionId
    ? a.id < b.id
      ? -1
      : a.id > b.id
        ? 1
        : 0
    : a.sessionId < b.sessionId
      ? -1
      : 1;

/**
 * Deterministic top-down tree layout (a simple tidy tree): leaves take consecutive slots left to
 * right, parents are centred over their children, depth sets the row. Roots are agents whose
 * parent is unknown (main agents, or children whose parent is not loaded). Same input set →
 * same output, regardless of input order. Cycles are cut at the first revisit.
 */
export function layoutAgentTree(agents: LayoutAgent[]): {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
} {
  const sorted = [...agents].sort(byKey);
  const ids = new Set(sorted.map((a) => a.id));
  const children = new Map<string, LayoutAgent[]>();
  const roots: LayoutAgent[] = [];
  for (const a of sorted) {
    if (a.parentAgentId !== null && a.parentAgentId !== a.id && ids.has(a.parentAgentId)) {
      const list = children.get(a.parentAgentId) ?? [];
      list.push(a);
      children.set(a.parentAgentId, list);
    } else {
      roots.push(a);
    }
  }

  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  const placed = new Set<string>();
  let slot = 0;

  const place = (agent: LayoutAgent, depth: number): number => {
    placed.add(agent.id);
    const kids = (children.get(agent.id) ?? []).filter((k) => !placed.has(k.id));
    let x: number;
    if (kids.length === 0) {
      x = slot * (NODE_WIDTH + GAP_X);
      slot += 1;
    } else {
      const xs = kids.map((k) => {
        edges.push({ id: `${agent.id}->${k.id}`, source: agent.id, target: k.id });
        return place(k, depth + 1);
      });
      x = ((xs[0] ?? 0) + (xs.at(-1) ?? 0)) / 2;
    }
    nodes.push({ id: agent.id, x, y: depth * (NODE_HEIGHT + GAP_Y), depth });
    return x;
  };

  for (const root of roots) {
    if (placed.has(root.id)) continue;
    place(root, 0);
    slot += TREE_GAP_SLOTS;
  }
  // agents only reachable through a cycle — place them as extra roots
  for (const a of sorted) if (!placed.has(a.id)) place(a, 0);

  return { nodes, edges };
}
