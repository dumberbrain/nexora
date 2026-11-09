import { type Execution, type Task } from "@nexora/contracts";

/**
 * Agent Teams mode (T140, research R3 + S2): ONE interactive Claude Code lead (runtime
 * `agent_team_pty`) in the execution worktree. The lead creates a native agent team and spawns
 * its own teammates; Nexora observes the team (hooks + read-only team files) and never emulates
 * a team with subagents (FR-011).
 */

/** Live-session key of the team lead (one per execution). */
export const TEAM_KEY = "*team";

/** "wait" while a risky task still awaits its approval decision. */
export function agentTeamsGate(tasks: readonly Task[]): "wait" | "start" | "nothing" {
  if (tasks.some((t) => t.status === "pending")) return "wait";
  return tasks.some((t) => t.status === "queued") ? "start" : "nothing";
}

/** The prompt typed into the lead's terminal once its input box is ready. */
export function agentTeamsPrompt(execution: Execution, tasks: readonly Task[]): string {
  const lines = tasks.map((t) => {
    const deps = t.dependsOn.length > 0 ? ` (after ${t.dependsOn.join(", ")})` : "";
    const role = t.assignedAgentRole ? ` → ${t.assignedAgentRole}` : "";
    const paths =
      t.ownedPaths.length === 0 || t.ownedPaths.includes("**")
        ? ""
        : ` [files: ${t.ownedPaths.join(", ")}]`;
    return `- ${t.id}: ${t.title}${role}${deps}${paths}`;
  });
  const teammates = Math.max(2, Math.min(5, tasks.length));
  return [
    "Create an agent team for the work below and lead it.",
    `Spawn about ${teammates} teammates, give each a clear share of the tasks (use the shared task list),`,
    "let them coordinate with each other, and review their results yourself.",
    "Everyone works in this directory (an isolated git worktree). Do not commit, push or deploy.",
    execution.strategy ? `Strategy: ${execution.strategy.replace("_", " ")}.` : "",
    "",
    "Tasks:",
    ...lines,
    "",
    "When every task is done: ask each teammate to shut down, clean up the team, and finish with",
    "a summary per task id of what changed.",
    "",
    "Overall request:",
    execution.prompt,
  ].join("\n");
}
