import { type ExecutionMode, type PlannedTask } from "@nexora/contracts";

/*
 * Hybrid planning rules (T140, FR-011): every task of a hybrid plan gets ONE mechanism and a
 * human-readable reason. Agent Teams are chosen only when they are actually usable (flag set and
 * the PTY runtime loaded) — otherwise the reason says so and the task goes to subagents; a team
 * is never simulated with subagents.
 */

export const HYBRID_MECHANISMS = ["multi_session", "subagents", "agent_teams"] as const;
export type HybridMechanism = (typeof HYBRID_MECHANISMS)[number] & ExecutionMode;

export interface HybridContext {
  agentTeams: { available: boolean; reason: string | null };
}

export type HybridTask = PlannedTask & { mode: HybridMechanism; mechanismReason: string };

/** Work where several agents must talk to each other, not just split files. */
const TEAM_SHAPED =
  /\b(agent teams?|teams? of|teammates?|collaborat\w*|coordinat\w*|debat\w*|competing hypothes[ie]s|brainstorm\w*|cross-layer|from (several|multiple|different) angles)\b/i;

const scopeOf = (t: PlannedTask) =>
  t.ownedPaths.length === 0 || t.ownedPaths.includes("**") ? null : t.ownedPaths.join(", ");

function decide(t: PlannedTask, ctx: HybridContext): { mode: HybridMechanism; reason: string } {
  const text = `${t.title}\n${t.description}`;
  const team = TEAM_SHAPED.exec(text)?.[0];
  if (team) {
    if (ctx.agentTeams.available) {
      return {
        mode: "agent_teams",
        reason: `Needs agents that talk to each other ("${team}"), so a native Agent Teams lead runs it in the execution worktree and spawns its own teammates; its terminal is shown in Nexora.`,
      };
    }
    return {
      mode: "subagents",
      reason: `Would suit Agent Teams ("${team}"), but Agent Teams are unavailable (${ctx.agentTeams.reason ?? "not enabled"}). A primary session delegates it to subagents instead — a team is never simulated.`,
    };
  }
  const scope = scopeOf(t);
  if (t.riskClass !== "normal") {
    return {
      mode: "multi_session",
      reason: `Risky (${t.riskClass}): runs in its own session after its approval, so it can be stopped or retried on its own${scope ? ` (scope: ${scope})` : ""}.`,
    };
  }
  if (scope) {
    return {
      mode: "multi_session",
      reason: `Scoped to ${scope}: an isolated session can work on it in parallel with the other tasks.`,
    };
  }
  return {
    mode: "subagents",
    reason: `No file scope was given, so a primary session delegates it to the ${t.assignedAgentRole ?? "best-suited"} subagent and integrates the result.`,
  };
}

/** Assign a mechanism + reason to every planned task (pure). */
export function planHybrid(tasks: readonly PlannedTask[], ctx: HybridContext): HybridTask[] {
  return tasks.map((t) => {
    const { mode, reason } = decide(t, ctx);
    const note = t.mechanismReason?.trim();
    const mechanismReason = (note ? `${reason} Planner note: ${note}` : reason).slice(0, 2000);
    return { ...t, mode, mechanismReason };
  });
}
