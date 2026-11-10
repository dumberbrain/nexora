import {
  type GraphIssue,
  type GraphValidation,
  NODE_CONFIG_SCHEMAS,
  type WorkflowGraph,
  WorkflowGraphSchema,
  type WorkflowNode,
} from "@ubuliera/contracts";

import { compileCondition, ConditionError } from "./condition-evaluator";

/**
 * Workflow graph validation (T126, data-model "WorkflowVersion"): per-kind config, single start,
 * an end reachable from every node, no cycles (v1), exactly one `true` and one `false` edge per
 * condition, fork/join pairing, retry ≤ 5, onError goto targets, and skill/MCP references against
 * the discovered catalog when one is given.
 */
export interface ValidationCatalog {
  /** discovered skills/commands: name → `executable`; absent = not checked */
  skills?: ReadonlyMap<string, boolean> | null;
  /** discovered MCP server names; absent = not checked */
  mcpServers?: ReadonlySet<string> | null;
}

export interface ValidationResult {
  validation: GraphValidation;
  /** the parsed graph (defaults applied) when its structure is well-formed, else null */
  graph: WorkflowGraph | null;
}

type Code = GraphIssue["code"];

/** Successor lists over the graph's edges plus `onError: { goto }` error edges. */
export interface GraphIndex {
  nodes: Map<string, WorkflowNode>;
  out: Map<string, string[]>;
  in: Map<string, string[]>;
}

export function indexGraph(graph: WorkflowGraph): GraphIndex {
  const nodes = new Map<string, WorkflowNode>();
  for (const n of graph.nodes) if (!nodes.has(n.id)) nodes.set(n.id, n);
  const out = new Map<string, string[]>([...nodes.keys()].map((id) => [id, []]));
  const inn = new Map<string, string[]>([...nodes.keys()].map((id) => [id, []]));
  const link = (s: string, t: string) => {
    out.get(s)?.push(t);
    inn.get(t)?.push(s);
  };
  for (const e of graph.edges)
    if (nodes.has(e.source) && nodes.has(e.target)) link(e.source, e.target);
  for (const n of nodes.values()) {
    if (typeof n.onError === "object" && nodes.has(n.onError.goto) && n.onError.goto !== n.id) {
      link(n.id, n.onError.goto);
    }
  }
  return { nodes, out, in: inn };
}

function reach(from: Iterable<string>, next: Map<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const stack = [...from];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(next.get(id) ?? []));
  }
  return seen;
}

function hasCycle(idx: GraphIndex): string | null {
  const state = new Map<string, 1 | 2>();
  const visit = (id: string): string | null => {
    state.set(id, 1);
    for (const t of idx.out.get(id) ?? []) {
      const s = state.get(t);
      if (s === 1) return t;
      if (s === undefined) {
        const found = visit(t);
        if (found) return found;
      }
    }
    state.set(id, 2);
    return null;
  };
  for (const id of idx.nodes.keys()) {
    if (!state.has(id)) {
      const found = visit(id);
      if (found) return found;
    }
  }
  return null;
}

/** Map zod structure errors to issues, pointing at the node/edge when possible. */
function structureIssues(
  input: unknown,
  error: { issues: { path: PropertyKey[]; message: string }[] },
) {
  const raw = (input ?? {}) as { nodes?: unknown; edges?: unknown };
  const refOf = (path: PropertyKey[]): string | null => {
    const [list, i] = path;
    const items = list === "nodes" ? raw.nodes : list === "edges" ? raw.edges : undefined;
    if (!Array.isArray(items) || typeof i !== "number") return null;
    const id = (items[i] as { id?: unknown } | undefined)?.id;
    return typeof id === "string" ? id : null;
  };
  return error.issues.map<GraphIssue>((i) => ({
    ref: refOf(i.path),
    code: "invalid_config",
    message: `${i.path.map(String).join(".") || "graph"}: ${i.message}`.slice(0, 500),
  }));
}

export function validateGraph(input: unknown, catalog: ValidationCatalog = {}): ValidationResult {
  const parsed = WorkflowGraphSchema.safeParse(input);
  if (!parsed.success) {
    return {
      validation: { valid: false, issues: structureIssues(input, parsed.error) },
      graph: null,
    };
  }
  const graph = parsed.data;
  const issues: GraphIssue[] = [];
  const add = (ref: string | null, code: Code, message: string) =>
    issues.push({ ref, code, message: message.slice(0, 500) });

  // ids
  const seenNodes = new Set<string>();
  for (const n of graph.nodes) {
    if (seenNodes.has(n.id)) add(n.id, "invalid_config", `Duplicate node id "${n.id}"`);
    seenNodes.add(n.id);
  }
  const seenEdges = new Set<string>();
  for (const e of graph.edges) {
    if (seenEdges.has(e.id)) add(e.id, "invalid_config", `Duplicate edge id "${e.id}"`);
    seenEdges.add(e.id);
    if (!seenNodes.has(e.source) || !seenNodes.has(e.target)) {
      add(e.id, "dangling_edge", `Edge ${e.id} connects a node that does not exist`);
    } else if (e.source === e.target) {
      add(e.id, "cycle", `Edge ${e.id} connects ${e.source} to itself`);
    }
  }

  const idx = indexGraph(graph);
  const nodes = [...idx.nodes.values()];

  // per-kind config
  for (const n of nodes) {
    const r = NODE_CONFIG_SCHEMAS[n.kind].safeParse(n.config);
    if (!r.success) {
      const detail = r.error.issues
        .map((i) => `${i.path.map(String).join(".") || "config"}: ${i.message}`)
        .join("; ");
      add(n.id, "invalid_config", `Invalid ${n.kind} config: ${detail}`);
    }
  }

  // start / end
  const starts = nodes.filter((n) => n.kind === "start");
  if (starts.length !== 1) {
    add(null, "start_count", `A workflow needs exactly one start node (found ${starts.length})`);
  }
  for (const s of starts) {
    if ((idx.in.get(s.id) ?? []).length > 0)
      add(s.id, "start_count", "The start node cannot have incoming edges");
  }
  for (const n of nodes) {
    if (n.kind === "end" && (idx.out.get(n.id) ?? []).length > 0) {
      add(n.id, "invalid_config", "An end node cannot have outgoing edges");
    }
  }

  // onError targets
  for (const n of nodes) {
    if (typeof n.onError !== "object") continue;
    const target = idx.nodes.get(n.onError.goto);
    if (!target) add(n.id, "on_error_target", `onError goto "${n.onError.goto}" does not exist`);
    else if (target.id === n.id)
      add(n.id, "on_error_target", "onError goto cannot target the node itself");
    else if (target.kind === "start")
      add(n.id, "on_error_target", "onError goto cannot target the start node");
  }

  const cyclic = hasCycle(idx);
  if (cyclic) add(cyclic, "cycle", `The graph has a cycle through "${cyclic}"`);

  // reachability
  const reachable = starts[0] ? reach([starts[0].id], idx.out) : new Set<string>();
  if (starts[0]) {
    for (const n of nodes) {
      if (!reachable.has(n.id))
        add(n.id, "unreachable_node", `"${n.id}" cannot be reached from start`);
    }
  }
  const ends = nodes.filter((n) => n.kind === "end").map((n) => n.id);
  const toEnd = reach(ends, idx.in);
  if (ends.length === 0 || (starts[0] && !toEnd.has(starts[0].id))) {
    add(null, "end_unreachable", "No end node is reachable from start");
  }
  for (const n of nodes) {
    if (n.kind !== "end" && reachable.has(n.id) && !toEnd.has(n.id) && ends.length > 0) {
      add(n.id, "end_unreachable", `No end node can be reached from "${n.id}"`);
    }
  }

  // conditions
  for (const e of graph.edges) {
    if (e.branch && idx.nodes.get(e.source)?.kind !== "condition") {
      add(
        e.id,
        "condition_branches",
        `Edge ${e.id} has a branch but its source is not a condition`,
      );
    }
  }
  for (const n of nodes) {
    if (n.kind !== "condition") continue;
    const outs = graph.edges.filter((e) => e.source === n.id);
    const t = outs.filter((e) => e.branch === "true").length;
    const f = outs.filter((e) => e.branch === "false").length;
    if (outs.length !== 2 || t !== 1 || f !== 1) {
      add(
        n.id,
        "condition_branches",
        `Condition "${n.id}" needs exactly one true and one false edge`,
      );
    }
    const expression = (n.config as { expression?: unknown }).expression;
    if (typeof expression !== "string") continue;
    try {
      const { refs } = compileCondition(expression);
      const before = reach(idx.in.get(n.id) ?? [], idx.in);
      for (const ref of refs) {
        if (!before.has(ref)) {
          add(
            n.id,
            "unknown_reference",
            `Condition "${n.id}" reads "${ref}", which does not run before it`,
          );
        }
      }
    } catch (err) {
      if (!(err instanceof ConditionError)) throw err;
      add(n.id, "invalid_config", `Invalid expression: ${err.message}`);
    }
  }

  if (!cyclic) forkJoinIssues(idx, add);

  // catalog references
  for (const n of nodes) {
    if (n.kind === "skill" && catalog.skills) {
      const name = (n.config as { skill?: unknown }).skill;
      if (typeof name !== "string") continue;
      const executable = catalog.skills.get(name);
      if (executable === undefined)
        add(n.id, "unknown_reference", `Skill "${name}" was not discovered`);
      else if (!executable) {
        add(
          n.id,
          "skill_not_executable",
          `Skill "${name}" is not user-invocable, so it cannot be a step`,
        );
      }
    }
    if (n.kind === "mcp_tool" && catalog.mcpServers) {
      const server = (n.config as { server?: unknown }).server;
      if (typeof server === "string" && !catalog.mcpServers.has(server)) {
        add(n.id, "unknown_reference", `MCP server "${server}" was not discovered`);
      }
    }
  }

  return { validation: { valid: issues.length === 0, issues }, graph };
}

/**
 * Every fork has ≥ 2 branches that meet again at one join (the nearest join reachable from all of
 * its branches); every join belongs to exactly one fork and is only fed from inside it.
 */
function forkJoinIssues(idx: GraphIndex, add: (ref: string | null, code: Code, m: string) => void) {
  const kindOf = (id: string) => idx.nodes.get(id)?.kind;
  const matchedBy = new Map<string, string[]>();
  for (const f of idx.nodes.values()) {
    if (f.kind !== "parallel_fork") continue;
    const branches = idx.out.get(f.id) ?? [];
    if (branches.length < 2) {
      add(f.id, "fork_join_mismatch", `Fork "${f.id}" needs at least two branches`);
      continue;
    }
    const joinSets = branches.map(
      (b) => new Set([...reach([b], idx.out)].filter((id) => kindOf(id) === "parallel_join")),
    );
    const common = [...(joinSets[0] ?? [])].filter((j) => joinSets.every((s) => s.has(j)));
    // nearest: not reachable from another common join
    const nearest = common.filter(
      (j) => !common.some((o) => o !== j && reach([o], idx.out).has(j)),
    );
    if (nearest.length !== 1) {
      add(f.id, "fork_join_mismatch", `The branches of fork "${f.id}" never meet at a join`);
      continue;
    }
    const j = nearest[0] as string;
    matchedBy.set(j, [...(matchedBy.get(j) ?? []), f.id]);
  }
  for (const j of idx.nodes.values()) {
    if (j.kind !== "parallel_join") continue;
    const preds = idx.in.get(j.id) ?? [];
    const forks = matchedBy.get(j.id) ?? [];
    if (preds.length < 2)
      add(j.id, "fork_join_mismatch", `Join "${j.id}" needs at least two incoming branches`);
    if (forks.length !== 1) {
      add(
        j.id,
        "fork_join_mismatch",
        `Join "${j.id}" must close exactly one fork (closes ${forks.length})`,
      );
      continue;
    }
    const inside = reach([forks[0] as string], idx.out);
    if (preds.some((p) => !inside.has(p))) {
      add(j.id, "fork_join_mismatch", `Join "${j.id}" is fed from outside its fork`);
    }
  }
}
