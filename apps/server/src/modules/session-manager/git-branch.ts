import { isInsideRoot, resolveInsideRoot } from "../../lib/path-guard";
import { runCommand } from "../../lib/process";

/** Resolves the checked-out branch of `cwd`; null when unknown. Must never throw. */
export type GitBranchResolver = (cwd: string, projectRoot: string) => Promise<string | null>;

/**
 * `git rev-parse --abbrev-ref HEAD` via the allowlisted process runner. Only runs inside the
 * registered project root (a user-trusted directory), so a hook payload cannot make Ubuliera run
 * git in an arbitrary repository with its own config. Detached HEAD and failures → null.
 */
export const gitBranchOf: GitBranchResolver = async (cwd, projectRoot) => {
  try {
    if (!isInsideRoot(projectRoot, cwd)) return null;
    const dir = await resolveInsideRoot(projectRoot, cwd);
    const res = await runCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: dir,
      timeoutMs: 5000,
      allowNonZero: true,
      maxOutputBytes: 4096,
    });
    const branch = res.stdout.trim();
    return res.exitCode === 0 && branch !== "" && branch !== "HEAD" ? branch.slice(0, 255) : null;
  } catch {
    return null;
  }
};
