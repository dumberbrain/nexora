import { type TaskStatus } from "@ubuliera/contracts";

import { AppError } from "../../http/errors";

/**
 * Task transitions, verbatim from data-model.md: pending→queued→planning→running;
 * running→waiting_for_input|blocked|reviewing|failed|cancelled; waiting_for_input|blocked→running;
 * reviewing→completed|running; failed is final (a retry creates a new attempt); any non-terminal
 * → cancelled; the user may move a task between pending and queued.
 */
export const TASK_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  pending: ["queued", "cancelled"],
  queued: ["pending", "planning", "cancelled"],
  planning: ["running", "cancelled"],
  running: ["waiting_for_input", "blocked", "reviewing", "failed", "cancelled"],
  waiting_for_input: ["running", "cancelled"],
  blocked: ["running", "cancelled"],
  reviewing: ["completed", "running", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

/** Statuses in which a task occupies a session slot. */
export const ACTIVE_TASK_STATUSES: ReadonlySet<TaskStatus> = new Set([
  "planning",
  "running",
  "waiting_for_input",
  "blocked",
]);

export function isTerminalTask(status: TaskStatus): boolean {
  return TASK_TRANSITIONS[status].length === 0;
}

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}

export function assertTaskTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransitionTask(from, to)) {
    throw new AppError("CONFLICT", `Task cannot go from ${from} to ${to}`);
  }
}

export interface DagNode {
  id: string;
  dependsOn: readonly string[];
}

const invalid = (message: string, path = "dependsOn") =>
  new AppError("VALIDATION_FAILED", message, [{ path, message }]);

/**
 * Kahn's algorithm; ties broken by input order so the result is deterministic. Throws
 * VALIDATION_FAILED for duplicate ids, self/unknown dependencies and cycles.
 */
export function topologicalOrder(nodes: readonly DagNode[]): string[] {
  const ids = new Set<string>();
  for (const n of nodes) {
    if (ids.has(n.id)) throw invalid(`Duplicate task id ${n.id}`, "id");
    ids.add(n.id);
  }
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const n of nodes) {
    for (const dep of n.dependsOn) {
      if (dep === n.id) throw invalid(`${n.id} depends on itself`);
      if (!ids.has(dep)) throw invalid(`${n.id} depends on unknown task ${dep}`);
      dependents.set(dep, [...(dependents.get(dep) ?? []), n.id]);
    }
    indegree.set(n.id, new Set(n.dependsOn).size);
  }
  const ready = nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift() as string;
    order.push(id);
    for (const next of new Set(dependents.get(id) ?? [])) {
      const left = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, left);
      if (left === 0) ready.push(next);
    }
  }
  if (order.length !== nodes.length) {
    const cyclic = nodes.filter((n) => !order.includes(n.id)).map((n) => n.id);
    throw invalid(`Task dependencies form a cycle: ${cyclic.join(", ")}`);
  }
  return order;
}

/** The dependency graph must be a DAG (data-model → TaskDependency). */
export function validateDag(nodes: readonly DagNode[]): void {
  topologicalOrder(nodes);
}

/** All transitive dependencies of every node. */
export function ancestorsByNode(nodes: readonly DagNode[]): Map<string, Set<string>> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const memo = new Map<string, Set<string>>();
  const visit = (id: string, trail: Set<string>): Set<string> => {
    const cached = memo.get(id);
    if (cached) return cached;
    const out = new Set<string>();
    if (trail.has(id)) return out;
    trail.add(id);
    for (const dep of byId.get(id)?.dependsOn ?? []) {
      out.add(dep);
      for (const a of visit(dep, trail)) out.add(a);
    }
    trail.delete(id);
    memo.set(id, out);
    return out;
  };
  for (const n of nodes) visit(n.id, new Set());
  return memo;
}
