import { type Execution, type Task } from "@ubuliera/contracts";

import { type AgentDefinitionInput } from "../../runtime-manager/runtime-adapter";
import { type DiscoveredItem } from "../../skill-registry/discovery";
import { BUILT_IN_ROLES } from "../agents/roles";

/**
 * Subagents mode (T100): ONE managed session in the execution worktree. Its main agent delegates
 * the planned tasks to the 8 built-in roles plus discovered project/user agents, then reviews and
 * integrates the result.
 */

/** "wait" while a risky task still awaits its approval decision. */
export function subagentsGate(tasks: readonly Task[]): "wait" | "start" | "nothing" {
  if (tasks.some((t) => t.status === "pending")) return "wait";
  return tasks.some((t) => t.status === "queued") ? "start" : "nothing";
}

/** Built-in roles + discovered agent definitions (a discovered agent overrides a same-name role). */
export function subagentDefinitions(
  discovered: readonly DiscoveredItem[],
): Record<string, AgentDefinitionInput> {
  const out: Record<string, AgentDefinitionInput> = { ...BUILT_IN_ROLES };
  for (const item of discovered) {
    if (item.kind !== "agent_definition" || !item.definition) continue;
    if (!/^[A-Za-z0-9:_-]{1,64}$/.test(item.name)) continue;
    out[item.name] = item.definition;
  }
  return out;
}

export function subagentsPrompt(
  execution: Execution,
  tasks: readonly Task[],
  agentNames: readonly string[],
): string {
  const lines = tasks.map((t) => {
    const deps = t.dependsOn.length > 0 ? ` (after ${t.dependsOn.join(", ")})` : "";
    const role = t.assignedAgentRole ? ` → ${t.assignedAgentRole}` : "";
    const paths = t.ownedPaths.includes("**") ? "" : ` [files: ${t.ownedPaths.join(", ")}]`;
    return `- ${t.id}: ${t.title}${role}${deps}${paths}`;
  });
  return [
    "You are the main agent coordinating specialised subagents in an isolated git worktree.",
    "Delegate each task below to the most suitable subagent (Task tool), respecting the order",
    "given by the dependencies, then review and integrate the results yourself.",
    `Available subagents: ${agentNames.join(", ")}.`,
    execution.strategy ? `Strategy: ${execution.strategy.replace("_", " ")}.` : "",
    "",
    "Tasks:",
    ...lines,
    "",
    "Do not commit, push or deploy. Finish with a summary per task id of what changed.",
    "",
    "Overall request:",
    execution.prompt,
  ].join("\n");
}

/** Union of the tasks' scopes; [] (= whole worktree) when any task owns everything. */
export function unionScope(tasks: readonly Task[]): string[] {
  if (tasks.some((t) => t.ownedPaths.length === 0 || t.ownedPaths.includes("**"))) return [];
  return [...new Set(tasks.flatMap((t) => t.ownedPaths))];
}
