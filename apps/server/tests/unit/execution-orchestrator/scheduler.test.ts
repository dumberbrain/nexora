import { type PlanConflict, type Task } from "@nexora/contracts";
import { describe, expect, it } from "vitest";

import {
  clampParallel,
  nextStarts,
  unreachableTasks,
} from "../../../src/modules/execution-orchestrator/scheduler";

const EXEC = "01JAAAAAAAAAAAAAAAAAAAAAAA";

function task(id: string, patch: Partial<Task> = {}): Task {
  return {
    id,
    executionId: EXEC,
    title: id,
    description: "",
    assignedAgentRole: null,
    agentId: null,
    mode: "multi_session",
    mechanismReason: null,
    priority: "p2",
    status: "queued",
    dependsOn: [],
    ownedPaths: ["**"],
    riskClass: "normal",
    changedFiles: [],
    testResults: null,
    attempt: 1,
    previousAttemptId: null,
    startedAt: null,
    completedAt: null,
    ...patch,
  };
}

const ids = (starts: { taskId: string }[]) => starts.map((s) => s.taskId);
const none = new Set<string>();

describe("scheduler", () => {
  it("defaults maxParallelSessions to 4 and caps it at 8", () => {
    expect(clampParallel(undefined)).toBe(4);
    expect(clampParallel(20)).toBe(8);
    expect(clampParallel(0)).toBe(1);
    const tasks = Array.from({ length: 10 }, (_, i) => task(`T-${i + 1}`));
    expect(nextStarts({ tasks, conflicts: [], approvedRiskyTaskIds: none })).toHaveLength(4);
    expect(
      nextStarts({ tasks, conflicts: [], approvedRiskyTaskIds: none, maxParallelSessions: 99 }),
    ).toHaveLength(8);
  });

  it("counts already active tasks against the limit", () => {
    const tasks = [
      task("T-1", { status: "running" }),
      task("T-2", { status: "waiting_for_input" }),
      task("T-3"),
      task("T-4"),
      task("T-5"),
    ];
    expect(
      ids(nextStarts({ tasks, conflicts: [], approvedRiskyTaskIds: none, maxParallelSessions: 3 })),
    ).toEqual(["T-3"]);
  });

  it("respects dependencies: only tasks whose dependencies completed may start", () => {
    const tasks = [
      task("T-1", { status: "completed" }),
      task("T-2", { dependsOn: ["T-1"] }),
      task("T-3", { dependsOn: ["T-4"] }),
      task("T-4", { status: "running" }),
    ];
    expect(ids(nextStarts({ tasks, conflicts: [], approvedRiskyTaskIds: none }))).toEqual(["T-2"]);
  });

  it("never starts pending tasks (not yet approved / queued)", () => {
    const tasks = [task("T-1", { status: "pending" }), task("T-2")];
    expect(ids(nextStarts({ tasks, conflicts: [], approvedRiskyTaskIds: none }))).toEqual(["T-2"]);
  });

  it("never starts a risky task without an approved approval request", () => {
    const tasks = [task("T-1", { riskClass: "destructive" }), task("T-2", { riskClass: "deploy" })];
    expect(nextStarts({ tasks, conflicts: [], approvedRiskyTaskIds: none })).toEqual([]);
    expect(ids(nextStarts({ tasks, conflicts: [], approvedRiskyTaskIds: new Set(["T-2"]) }))).toEqual(
      ["T-2"],
    );
  });

  it("serialises conflicting tasks", () => {
    const tasks = [task("T-1"), task("T-2"), task("T-3")];
    const conflicts: PlanConflict[] = [
      { taskIds: ["T-1", "T-2"], paths: ["**"], resolution: "serialised" },
    ];
    expect(ids(nextStarts({ tasks, conflicts, approvedRiskyTaskIds: none }))).toEqual([
      "T-1",
      "T-3",
    ]);
    const later = [task("T-1", { status: "running" }), task("T-2"), task("T-3", { status: "running" })];
    expect(nextStarts({ tasks: later, conflicts, approvedRiskyTaskIds: none })).toEqual([]);
    const done = [task("T-1", { status: "completed" }), task("T-2"), task("T-3")];
    expect(ids(nextStarts({ tasks: done, conflicts, approvedRiskyTaskIds: none }))).toEqual([
      "T-2",
      "T-3",
    ]);
  });

  it("runs separate_worktrees conflicts in parallel, each in its own task worktree", () => {
    const tasks = [task("T-1"), task("T-2"), task("T-3")];
    const conflicts: PlanConflict[] = [
      { taskIds: ["T-1", "T-2"], paths: ["**"], resolution: "separate_worktrees" },
    ];
    expect(nextStarts({ tasks, conflicts, approvedRiskyTaskIds: none })).toEqual([
      { taskId: "T-1", workspace: "task" },
      { taskId: "T-2", workspace: "task" },
      { taskId: "T-3", workspace: "execution" },
    ]);
  });

  it("sequential parallelism runs one task at a time", () => {
    const tasks = [task("T-1"), task("T-2")];
    expect(
      ids(nextStarts({ tasks, conflicts: [], approvedRiskyTaskIds: none, sequential: true })),
    ).toEqual(["T-1"]);
  });

  it("orders by priority, then by task number", () => {
    const tasks = [task("T-10"), task("T-2", { priority: "p3" }), task("T-3", { priority: "p1" })];
    expect(ids(nextStarts({ tasks, conflicts: [], approvedRiskyTaskIds: none }))).toEqual([
      "T-3",
      "T-10",
      "T-2",
    ]);
  });

  it("finds tasks that can never run because a dependency failed or was cancelled", () => {
    const tasks = [
      task("T-1", { status: "failed" }),
      task("T-2", { dependsOn: ["T-1"], status: "pending" }),
      task("T-3", { dependsOn: ["T-2"] }),
      task("T-4", { status: "cancelled" }),
      task("T-5", { dependsOn: ["T-4"] }),
      task("T-6"),
    ];
    expect(unreachableTasks(tasks).sort()).toEqual(["T-2", "T-3", "T-5"]);
  });
});
