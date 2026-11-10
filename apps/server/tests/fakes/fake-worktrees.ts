import { join } from "node:path";

import { type WorktreeProvider } from "../../src/modules/execution-orchestrator/worktree-provider";

/** Test-only WorktreeProvider: computes the real layout, never runs git. */
export class FakeWorktrees implements WorktreeProvider {
  readonly created: string[] = [];
  /** changed files reported per worktree path */
  readonly changes = new Map<string, string[]>();

  executionWorktree(repoRoot: string, executionId: string): Promise<string> {
    const path = join(repoRoot, ".ubuliera", "worktrees", executionId, "main");
    this.created.push(path);
    return Promise.resolve(path);
  }

  taskWorktree(repoRoot: string, executionId: string, taskId: string): Promise<string> {
    const path = join(repoRoot, ".ubuliera", "worktrees", executionId, taskId);
    this.created.push(path);
    return Promise.resolve(path);
  }

  changedFiles(worktree: string): Promise<string[]> {
    return Promise.resolve(this.changes.get(worktree) ?? []);
  }
}
