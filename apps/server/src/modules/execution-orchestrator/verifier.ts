import { type Task, type Verification } from "@ubuliera/contracts";

import { type WorktreeProvider } from "./worktree-provider";

/**
 * Verifier (T101): completed/failed tasks and every changed file across the execution's
 * worktrees. Test results are reported only when tests actually ran; Ubuliera's process allowlist
 * (claude, git, gh — FR-051) does not include package-manager test runners yet, so
 * `testResults` stays null instead of being guessed.
 */
export interface VerificationInput {
  tasks: readonly Task[];
  worktreePaths: readonly string[];
  worktrees: WorktreeProvider;
  /** raw output of an approved, allowlisted test run (when one exists) */
  testOutput?: string | null;
}

export async function buildVerification(input: VerificationInput): Promise<Verification> {
  const files = new Set<string>();
  for (const t of input.tasks) for (const f of t.changedFiles) files.add(f);
  for (const path of new Set(input.worktreePaths)) {
    try {
      for (const f of await input.worktrees.changedFiles(path)) files.add(f);
    } catch {
      /* a removed or broken worktree must not hide the rest of the summary */
    }
  }
  // a failed attempt that was retried is superseded by its newer attempt (US3 retry)
  const superseded = new Set(input.tasks.map((t) => t.previousAttemptId));
  return {
    completedTaskIds: input.tasks.filter((t) => t.status === "completed").map((t) => t.id),
    failedTaskIds: input.tasks
      .filter((t) => t.status === "failed" && !superseded.has(t.id))
      .map((t) => t.id),
    changedFiles: [...files].sort(),
    testResults: input.testOutput ? parseTestSummary(input.testOutput) : null,
  };
}

const count = (text: string, word: string): number | null => {
  const re = new RegExp(`(\\d+)\\s+${word}\\b`, "i");
  const m = re.exec(text);
  return m?.[1] === undefined ? null : Number(m[1]);
};

/**
 * Pass/fail/skip counts from the summary line of Vitest, Jest or pytest output. Returns null
 * when no recognisable summary exists (never invents numbers).
 */
export function parseTestSummary(
  output: string,
): { passed: number; failed: number; skipped: number } | null {
  const lines = output.split(/\r?\n/);
  const summary =
    lines.find((l) => /^\s*Tests:?\s+\d/.test(l)) ??
    [...lines].reverse().find((l) => /\d+\s+(passed|failed)\b/i.test(l));
  if (!summary) return null;
  const passed = count(summary, "passed");
  const failed = count(summary, "failed");
  if (passed === null && failed === null) return null;
  return { passed: passed ?? 0, failed: failed ?? 0, skipped: count(summary, "skipped") ?? 0 };
}
