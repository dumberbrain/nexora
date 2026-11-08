/**
 * Root query keys shared by entity key factories and the socket bridge.
 * Convention every entity factory MUST follow so realtime patches hit the right cache:
 *   all = [root] · lists() = [root, "list"] · detail(id) = [root, "detail", id]
 */
export const ENTITY_ROOTS = {
  execution: "executions",
  task: "tasks",
  session: "sessions",
  agent: "agents",
  approval: "approvals",
  workflowRun: "workflow-runs",
} as const;

export type EntityKind = keyof typeof ENTITY_ROOTS;

export const entityListKey = (kind: EntityKind) => [ENTITY_ROOTS[kind], "list"] as const;
export const entityDetailKey = (kind: EntityKind, id: string) =>
  [ENTITY_ROOTS[kind], "detail", id] as const;

/** Overview counters pushed by the `stats` socket event. */
export const statsKey = ["stats", "current"] as const;
