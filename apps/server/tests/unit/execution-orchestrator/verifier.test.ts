import { type Task } from "@nexora/contracts";
import { describe, expect, it } from "vitest";

import {
  buildVerification,
  parseTestSummary,
} from "../../../src/modules/execution-orchestrator/verifier";
import { FakeWorktrees } from "../../fakes/fake-worktrees";

const task = (id: string, status: Task["status"], changedFiles: string[] = []): Task => ({
  id,
  executionId: "01JAAAAAAAAAAAAAAAAAAAAAAA",
  title: id,
  description: "",
  assignedAgentRole: null,
  agentId: null,
  mode: "multi_session",
  mechanismReason: null,
  priority: "p2",
  status,
  dependsOn: [],
  ownedPaths: ["**"],
  riskClass: "normal",
  changedFiles,
  testResults: null,
  attempt: 1,
  previousAttemptId: null,
  startedAt: null,
  completedAt: null,
});

describe("verifier", () => {
  it("collects completed/failed tasks and the union of changed files across worktrees", async () => {
    const wt = new FakeWorktrees();
    wt.changes.set("/w/main", ["b.ts", "a.ts"]);
    wt.changes.set("/w/T-2", ["a.ts", "c.ts"]);
    const v = await buildVerification({
      tasks: [task("T-1", "completed"), task("T-2", "failed"), task("T-3", "cancelled", ["d.ts"])],
      worktreePaths: ["/w/main", "/w/T-2"],
      worktrees: wt,
    });
    expect(v).toEqual({
      completedTaskIds: ["T-1"],
      failedTaskIds: ["T-2"],
      changedFiles: ["a.ts", "b.ts", "c.ts", "d.ts"],
      testResults: null,
    });
  });

  it("a worktree that cannot be diffed does not fail verification", async () => {
    const v = await buildVerification({
      tasks: [task("T-1", "completed", ["x.ts"])],
      worktreePaths: ["/gone"],
      worktrees: {
        executionWorktree: () => Promise.reject(new Error("n/a")),
        taskWorktree: () => Promise.reject(new Error("n/a")),
        changedFiles: () => Promise.reject(new Error("not a worktree")),
      },
    });
    expect(v.changedFiles).toEqual(["x.ts"]);
  });

  it.each([
    ["Tests  12 passed | 2 failed | 1 skipped (15)", { passed: 12, failed: 2, skipped: 1 }],
    ["      Tests  79 passed (79)", { passed: 79, failed: 0, skipped: 0 }],
    [
      "Tests:       1 failed, 3 skipped, 10 passed, 14 total",
      { passed: 10, failed: 1, skipped: 3 },
    ],
    ["===== 5 passed, 1 failed, 2 skipped in 0.12s =====", { passed: 5, failed: 1, skipped: 2 }],
  ])("parses test summaries %#", (text, expected) => {
    expect(parseTestSummary(text)).toEqual(expected);
  });

  it("returns null when no summary is recognised", () => {
    expect(parseTestSummary("compiled successfully")).toBeNull();
  });
});
