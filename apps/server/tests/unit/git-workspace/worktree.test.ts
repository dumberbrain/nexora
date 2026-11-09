import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCommand } from "../../../src/lib/process";
import { DiffService } from "../../../src/modules/git-workspace/diff.service";
import {
  WorktreeError,
  WorktreeService,
} from "../../../src/modules/git-workspace/worktree.service";

const EXEC = "01JD8X3Y4Z5A6B7C8D9E0F1G2H";
const OTHER_EXEC = "01JD8X3Y4Z5A6B7C8D9E0F1G2J";

const git = async (cwd: string, ...args: string[]) =>
  (
    await runCommand(
      "git",
      [
        "-c",
        "user.email=t@example.com",
        "-c",
        "user.name=Test",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { cwd },
    )
  ).stdout.trim();

let repo: string;
const service = new WorktreeService();
const diff = new DiffService();

beforeEach(async () => {
  repo = realpathSync(mkdtempSync(join(tmpdir(), "nexora-wt-")));
  await git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "README.md"), "hello\n");
  await git(repo, "add", ".");
  await git(repo, "commit", "-q", "-m", "init");
});

afterEach(async () => {
  try {
    await git(repo, "worktree", "prune");
  } catch {
    /* ignore */
  }
  rmSync(repo, { recursive: true, force: true });
});

describe("WorktreeService", () => {
  it("creates the execution worktree on nexora/<execution> and excludes .nexora/", async () => {
    const wt = await service.createExecutionWorktree(repo, EXEC);
    expect(wt.path).toBe(join(repo, ".nexora", "worktrees", EXEC, "main"));
    expect(wt.branch).toBe(`nexora/${EXEC}`);
    expect(existsSync(join(wt.path, "README.md"))).toBe(true);
    expect(await git(wt.path, "rev-parse", "--abbrev-ref", "HEAD")).toBe(`nexora/${EXEC}`);

    const exclude = readFileSync(join(repo, ".git", "info", "exclude"), "utf8");
    expect(exclude.split(/\r?\n/)).toContain(".nexora/");
    // the project root stays clean: the worktree folder is not reported as untracked
    expect(await git(repo, "status", "--porcelain")).toBe("");
  });

  it("is idempotent and does not duplicate the exclude entry", async () => {
    const a = await service.createExecutionWorktree(repo, EXEC);
    const b = await service.createExecutionWorktree(repo, EXEC);
    expect(b).toEqual(a);
    const exclude = readFileSync(join(repo, ".git", "info", "exclude"), "utf8");
    expect(exclude.split(/\r?\n/).filter((l) => l === ".nexora/")).toHaveLength(1);
  });

  it("creates a task worktree branched from the execution branch", async () => {
    const main = await service.createExecutionWorktree(repo, EXEC);
    writeFileSync(join(main.path, "plan.md"), "plan\n");
    await git(main.path, "add", ".");
    await git(main.path, "commit", "-q", "-m", "plan");

    const task = await service.createTaskWorktree(repo, EXEC, "T-3");
    expect(task.path).toBe(join(repo, ".nexora", "worktrees", EXEC, "T-3"));
    expect(task.branch).toBe(`nexora/${EXEC}--T-3`);
    expect(existsSync(join(task.path, "plan.md"))).toBe(true);
  });

  it("rejects malformed execution and task ids (no path or ref injection)", async () => {
    await expect(service.createExecutionWorktree(repo, "../../evil")).rejects.toBeInstanceOf(
      WorktreeError,
    );
    await expect(service.createExecutionWorktree(repo, "--force")).rejects.toBeInstanceOf(
      WorktreeError,
    );
    await service.createExecutionWorktree(repo, EXEC);
    await expect(service.createTaskWorktree(repo, EXEC, "T-1/../x")).rejects.toBeInstanceOf(
      WorktreeError,
    );
  });

  it("a task worktree requires the execution worktree", async () => {
    await expect(service.createTaskWorktree(repo, OTHER_EXEC, "T-1")).rejects.toBeInstanceOf(
      WorktreeError,
    );
  });

  it("refuses to remove a worktree with uncommitted changes unless discarding is explicit", async () => {
    const wt = await service.createExecutionWorktree(repo, EXEC);
    writeFileSync(join(wt.path, "README.md"), "changed\n");
    await expect(service.remove(repo, wt.path)).rejects.toBeInstanceOf(WorktreeError);
    expect(existsSync(wt.path)).toBe(true);
    await service.remove(repo, wt.path, { discardChanges: true });
    expect(existsSync(wt.path)).toBe(false);
  });

  it("refuses to remove a path that is not a Nexora worktree", async () => {
    await expect(service.remove(repo, repo)).rejects.toBeInstanceOf(WorktreeError);
  });

  it("cleanupExecution removes the task and execution worktrees but keeps the branches", async () => {
    await service.createExecutionWorktree(repo, EXEC);
    await service.createTaskWorktree(repo, EXEC, "T-1");
    await service.cleanupExecution(repo, EXEC);
    expect(existsSync(join(repo, ".nexora", "worktrees", EXEC))).toBe(false);
    const branches = await git(repo, "branch", "--list", "nexora/*", "--format=%(refname:short)");
    expect(branches.split("\n").sort()).toEqual([`nexora/${EXEC}`, `nexora/${EXEC}--T-1`]);
  });
});

describe("DiffService", () => {
  it("lists committed, staged, unstaged and untracked changes relative to a base", async () => {
    const wt = await service.createExecutionWorktree(repo, EXEC);
    writeFileSync(join(wt.path, "committed.ts"), "a\n");
    await git(wt.path, "add", ".");
    await git(wt.path, "commit", "-q", "-m", "c");
    writeFileSync(join(wt.path, "README.md"), "edited\n");
    writeFileSync(join(wt.path, "new file.txt"), "untracked\n");

    expect(await diff.changedFiles(wt.path)).toEqual(["README.md", "new file.txt"]);
    expect(await diff.changedFiles(wt.path, { base: "main" })).toEqual([
      "README.md",
      "committed.ts",
      "new file.txt",
    ]);
  });

  it("rejects a base that looks like an option", async () => {
    const wt = await service.createExecutionWorktree(repo, EXEC);
    await expect(diff.changedFiles(wt.path, { base: "--output=x" })).rejects.toThrow();
  });
});
