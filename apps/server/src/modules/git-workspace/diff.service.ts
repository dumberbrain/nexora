import { type GitRunner } from "./worktree.service";
import { runCommand } from "../../lib/process";

const defaultGit: GitRunner = (cwd, args) => runCommand("git", args, { cwd, timeoutMs: 60_000 });

const splitZ = (out: string) => out.split("\0").filter(Boolean);

/** Changed-file detection for a worktree (T092): `git diff --name-only` + untracked files. */
export class DiffService {
  private readonly git: GitRunner;

  constructor(opts: { git?: GitRunner } = {}) {
    this.git = opts.git ?? defaultGit;
  }

  /**
   * Files changed in `worktree`, sorted, repo-relative with `/` separators. Without `base`:
   * uncommitted (staged + unstaged) and untracked changes. With `base` (a branch/commit): also
   * everything committed since `base`.
   */
  async changedFiles(worktree: string, opts: { base?: string } = {}): Promise<string[]> {
    const base = opts.base ?? "HEAD";
    if (base.startsWith("-") || base.includes("\0")) throw new Error(`Invalid base ref: ${base}`);
    const tracked = await this.git(worktree, [
      "-c",
      "core.quotepath=off",
      "diff",
      "--name-only",
      "-z",
      "--end-of-options",
      base,
      "--",
    ]);
    const untracked = await this.git(worktree, [
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z",
    ]);
    return [...new Set([...splitZ(tracked.stdout), ...splitZ(untracked.stdout)])].sort();
  }
}
