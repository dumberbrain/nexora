import { type Task } from "@ubuliera/contracts";

import { type ScheduledStart } from "../scheduler";

/**
 * Hybrid mode (T140): each task runs with the mechanism the hybrid planner chose for it
 * (`Task.mode` + `mechanismReason`) on the existing executors —
 * `multi_session`: its own managed session (like multi-session mode);
 * `subagents`: batched into one primary session that delegates to subagents;
 * `agent_teams`: batched into one Agent Teams lead (PTY).
 */

export interface HybridDispatch {
  sessions: { task: Task; workspace: ScheduledStart["workspace"] }[];
  subagents: Task[];
  team: Task[];
}

/** Group the scheduler's starts of this round by mechanism. */
export function hybridDispatch(
  starts: readonly ScheduledStart[],
  tasks: readonly Task[],
): HybridDispatch {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const out: HybridDispatch = { sessions: [], subagents: [], team: [] };
  for (const s of starts) {
    const task = byId.get(s.taskId);
    if (!task) continue;
    if (task.mode === "agent_teams") out.team.push(task);
    else if (task.mode === "subagents") out.subagents.push(task);
    else out.sessions.push({ task, workspace: s.workspace });
  }
  return out;
}
