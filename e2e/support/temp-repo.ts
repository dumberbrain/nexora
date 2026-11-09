import { rmSync } from "node:fs";

/**
 * Best-effort removal of a spec's temp repo. On Windows the server may still hold a handle in a
 * Nexora worktree for a moment (EBUSY); a leftover temp dir must not fail the run.
 */
export function removeTempRepo(root: string): void {
  if (!root) return;
  try {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // left for the OS temp cleanup
  }
}
