/**
 * What the orchestrator needs from the git-workspace module (T092, owned by the runtime
 * workstream). Every managed session runs in a worktree returned from here — never in the
 * registered project root (FR-034, R5).
 */
export interface WorktreeProvider {
  /** `<repo>/.ubuliera/worktrees/<execution>/main` on branch `ubuliera/<execution>` */
  executionWorktree(repoRoot: string, executionId: string): Promise<string>;
  /** `<repo>/.ubuliera/worktrees/<execution>/<task>` on `ubuliera/<execution>/<task>` */
  taskWorktree(repoRoot: string, executionId: string, taskId: string): Promise<string>;
  /** repo-relative paths (forward slashes) changed in a worktree */
  changedFiles(worktree: string): Promise<string[]>;
}
