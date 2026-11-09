import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
} from "node:fs";
import path from "node:path";

import { TaskIdSchema, UlidSchema } from "@nexora/contracts";

import { isInsideRoot } from "../../lib/path-guard";
import { ProcessExitError, runCommand, type RunResult } from "../../lib/process";

export class WorktreeError extends Error {
  override readonly name = "WorktreeError";
}

export type GitRunner = (cwd: string, args: readonly string[]) => Promise<RunResult>;

export interface Worktree {
  path: string;
  branch: string;
}

const EXCLUDE_ENTRY = ".nexora/";
const isWin = process.platform === "win32";

const defaultGit: GitRunner = (cwd, args) => runCommand("git", args, { cwd, timeoutMs: 120_000 });

/** Folder holding every Nexora worktree of a repository. */
export const worktreesRoot = (repoRoot: string) => path.join(repoRoot, ".nexora", "worktrees");

/** `nexora/<execution>` — the execution branch. */
export const executionBranch = (executionId: string) => `nexora/${executionId}`;
/**
 * Task branch. NOT `nexora/<execution>/<task>` as first planned: git cannot hold both
 * `refs/heads/nexora/<execution>` (a file) and `refs/heads/nexora/<execution>/<task>` (needs a
 * directory of the same name), so the task part is joined with `--`.
 */
export const taskBranch = (executionId: string, taskId: string) =>
  `nexora/${executionId}--${taskId}`;

const samePath = (a: string, b: string) => {
  const norm = (p: string) => (isWin ? path.resolve(p).toLowerCase() : path.resolve(p));
  return norm(a) === norm(b);
};

function checkIds(executionId: string, taskId?: string): void {
  if (!UlidSchema.safeParse(executionId).success) {
    throw new WorktreeError(`Invalid execution id: ${executionId}`);
  }
  if (taskId !== undefined && !TaskIdSchema.safeParse(taskId).success) {
    throw new WorktreeError(`Invalid task id: ${taskId}`);
  }
}

const gitMessage = (err: unknown) =>
  err instanceof ProcessExitError
    ? (err.result.stderr || err.result.stdout).trim() || err.message
    : err instanceof Error
      ? err.message
      : String(err);

/**
 * Git workspace isolation (T092, FR-034). Every managed execution works in
 * `<repo>/.nexora/worktrees/<execution>/main` on `nexora/<execution>`; parallel conflicting tasks
 * get `<repo>/.nexora/worktrees/<execution>/<task>`. `.nexora/` is added to the repo's
 * `.git/info/exclude` (never to a tracked file). Branches are kept on cleanup so work is never
 * lost; nothing is ever pushed.
 */
export class WorktreeService {
  private readonly git: GitRunner;

  constructor(opts: { git?: GitRunner } = {}) {
    this.git = opts.git ?? defaultGit;
  }

  async createExecutionWorktree(repoRoot: string, executionId: string): Promise<Worktree> {
    checkIds(executionId);
    const wt: Worktree = {
      path: path.join(worktreesRoot(repoRoot), executionId, "main"),
      branch: executionBranch(executionId),
    };
    await this.ensureExcluded(repoRoot);
    await this.add(repoRoot, wt, "HEAD");
    return wt;
  }

  async createTaskWorktree(
    repoRoot: string,
    executionId: string,
    taskId: string,
  ): Promise<Worktree> {
    checkIds(executionId, taskId);
    const base = executionBranch(executionId);
    if (!(await this.branchExists(repoRoot, base))) {
      throw new WorktreeError(`Execution worktree for ${executionId} does not exist`);
    }
    const wt: Worktree = {
      path: path.join(worktreesRoot(repoRoot), executionId, taskId),
      branch: taskBranch(executionId, taskId),
    };
    await this.ensureExcluded(repoRoot);
    await this.add(repoRoot, wt, base);
    return wt;
  }

  /**
   * Remove one Nexora worktree. Fails on uncommitted changes unless `discardChanges` is set
   * (an explicit user decision). The branch is kept.
   */
  async remove(
    repoRoot: string,
    worktreePath: string,
    opts: { discardChanges?: boolean } = {},
  ): Promise<void> {
    const root = worktreesRoot(repoRoot);
    if (samePath(root, worktreePath) || !isInsideRoot(root, worktreePath)) {
      throw new WorktreeError(`Not a Nexora worktree: ${worktreePath}`);
    }
    const registered = await this.list(repoRoot);
    if (!registered.some((p) => samePath(p, worktreePath))) {
      throw new WorktreeError(`Not a registered worktree: ${worktreePath}`);
    }
    const args = [
      "worktree",
      "remove",
      ...(opts.discardChanges ? ["--force"] : []),
      "--",
      worktreePath,
    ];
    try {
      await this.git(repoRoot, args);
    } catch (err) {
      throw new WorktreeError(`Could not remove worktree ${worktreePath}: ${gitMessage(err)}`);
    }
  }

  /** Remove all worktrees of an execution (task worktrees first); branches are kept. */
  async cleanupExecution(
    repoRoot: string,
    executionId: string,
    opts: { discardChanges?: boolean } = {},
  ): Promise<void> {
    checkIds(executionId);
    const dir = path.join(worktreesRoot(repoRoot), executionId);
    const mine = (await this.list(repoRoot)).filter(
      (p) => isInsideRoot(dir, p) && !samePath(dir, p),
    );
    const main = path.join(dir, "main");
    const ordered = [
      ...mine.filter((p) => !samePath(p, main)),
      ...mine.filter((p) => samePath(p, main)),
    ];
    for (const p of ordered) await this.remove(repoRoot, p, opts);
    await this.git(repoRoot, ["worktree", "prune"]);
    try {
      if (existsSync(dir) && readdirSync(dir).length === 0) rmdirSync(dir);
    } catch {
      /* leave a non-empty or locked folder in place */
    }
  }

  /** Absolute paths of the repo's registered worktrees (including the main checkout). */
  async list(repoRoot: string): Promise<string[]> {
    const r = await this.git(repoRoot, ["worktree", "list", "--porcelain"]);
    return r.stdout
      .split(/\r?\n/)
      .filter((l) => l.startsWith("worktree "))
      .map((l) => path.resolve(l.slice("worktree ".length)));
  }

  private async add(repoRoot: string, wt: Worktree, base: string): Promise<void> {
    if ((await this.list(repoRoot)).some((p) => samePath(p, wt.path))) return;
    const args = (await this.branchExists(repoRoot, wt.branch))
      ? ["worktree", "add", "--", wt.path, wt.branch]
      : ["worktree", "add", "-b", wt.branch, "--", wt.path, base];
    try {
      await this.git(repoRoot, args);
    } catch (err) {
      throw new WorktreeError(`Could not create worktree ${wt.path}: ${gitMessage(err)}`);
    }
  }

  private async branchExists(repoRoot: string, branch: string): Promise<boolean> {
    try {
      await this.git(repoRoot, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]);
      return true;
    } catch {
      return false;
    }
  }

  /** Add `.nexora/` to the repo's (common) `info/exclude` once. */
  private async ensureExcluded(repoRoot: string): Promise<void> {
    const r = await this.git(repoRoot, ["rev-parse", "--git-common-dir"]);
    const gitDir = path.resolve(repoRoot, r.stdout.trim());
    const infoDir = path.join(gitDir, "info");
    const file = path.join(infoDir, "exclude");
    const current = existsSync(file) ? readFileSync(file, "utf8") : "";
    if (current.split(/\r?\n/).some((l) => l.trim() === EXCLUDE_ENTRY)) return;
    mkdirSync(infoDir, { recursive: true });
    const sep = current === "" || current.endsWith("\n") ? "" : "\n";
    appendFileSync(file, `${sep}${EXCLUDE_ENTRY}\n`);
  }
}
