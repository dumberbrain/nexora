import { type Execution, type Task } from "@ubuliera/contracts";
import picomatch from "picomatch";

/**
 * Multi-session mode (T100): one managed session per task, each in the execution worktree or —
 * for tasks in a `separate_worktrees` conflict — its own task worktree. Never the project root.
 */

/** Prompt for the session that implements one task. */
export function taskPrompt(execution: Execution, task: Task, all: readonly Task[]): string {
  const deps = all.filter((t) => task.dependsOn.includes(t.id));
  const scope =
    task.ownedPaths.length === 0 || task.ownedPaths.includes("**")
      ? "the whole repository (stay focused on this task)"
      : task.ownedPaths.join(", ");
  return [
    `You are implementing task ${task.id} of a larger change, in an isolated git worktree.`,
    `Task ${task.id}: ${task.title}`,
    task.description && task.description !== task.title ? `Details: ${task.description}` : null,
    task.assignedAgentRole ? `Your role: ${task.assignedAgentRole}.` : null,
    `You may only modify: ${scope}. Edits outside this scope are denied.`,
    deps.length > 0
      ? `Already completed before you: ${deps.map((d) => `${d.id} (${d.title})`).join("; ")}.`
      : null,
    execution.strategy ? `Strategy: ${execution.strategy.replace("_", " ")}.` : null,
    "Do not commit, push or deploy. Finish with a short summary of what you changed.",
    "",
    "Overall request (for context only):",
    execution.prompt,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

/** Changed files of a worktree attributable to a task (its ownedPaths). */
export function filesOwnedBy(files: readonly string[], ownedPaths: readonly string[]): string[] {
  if (ownedPaths.length === 0) return [...files];
  const match = picomatch(
    ownedPaths.map((p) => p.replace(/\\/g, "/")),
    { dot: true },
  );
  return files.filter((f) => match(f.replace(/\\/g, "/")));
}
