import {
  type BoardColumn,
  boardColumnOf,
  type Execution,
  type ExecutionStatus,
  MoveTaskInputSchema,
  type Task,
  TASK_STATUSES,
  type TaskStatus,
} from "@ubuliera/contracts";
import { describe, expect, it, vi } from "vitest";

import { AppError } from "../../../src/http/errors";
import {
  assertUserMove,
  type BoardDeps,
  BoardService,
  userMoveRefusal,
} from "../../../src/modules/task-manager/board";

const COLUMN: Record<TaskStatus, BoardColumn> = {
  pending: "backlog",
  queued: "todo",
  planning: "in_progress",
  running: "in_progress",
  waiting_for_input: "in_progress",
  blocked: "in_progress",
  reviewing: "review",
  completed: "completed",
  failed: "failed",
  cancelled: "failed",
};

function refusal(fn: () => unknown): AppError {
  try {
    fn();
  } catch (err) {
    if (err instanceof AppError) return err;
    throw err;
  }
  throw new Error("expected a refusal");
}

describe("board columns", () => {
  it.each(TASK_STATUSES.values.map((s) => [s, COLUMN[s]] as const))(
    "%s sits in %s",
    (status, column) => {
      expect(boardColumnOf(status)).toBe(column);
    },
  );
});

describe("user moves", () => {
  it("allows only pending ⇄ queued", () => {
    expect(userMoveRefusal("pending", "queued")).toBeNull();
    expect(userMoveRefusal("queued", "pending")).toBeNull();
    expect(() => assertUserMove("pending", "queued")).not.toThrow();
    expect(() => assertUserMove("queued", "pending")).not.toThrow();
    expect(MoveTaskInputSchema.safeParse({ status: "queued" }).success).toBe(true);
    expect(MoveTaskInputSchema.safeParse({ status: "completed" }).success).toBe(false);
  });

  it("a drop on the same column is not a move", () => {
    expect(userMoveRefusal("pending", "pending")).toBeNull();
    expect(userMoveRefusal("queued", "queued")).toBeNull();
  });

  const others: [TaskStatus, TaskStatus][] = [];
  for (const from of TASK_STATUSES.values) {
    for (const to of TASK_STATUSES.values) {
      if (from === to) continue;
      if ((from === "pending" || from === "queued") && (to === "pending" || to === "queued"))
        continue;
      others.push([from, to]);
    }
  }

  it.each(others)("%s → %s is refused with CONFLICT and a reason", (from, to) => {
    const err = refusal(() => assertUserMove(from, to));
    expect(err.code).toBe("CONFLICT");
    expect(err.message).toBe(userMoveRefusal(from, to));
    expect(err.message).toContain(`${from} → ${to} is not a user move; `);
    expect(err.message.length).toBeGreaterThan(`${from} → ${to} is not a user move; `.length + 10);
  });

  it("explains why, in human terms", () => {
    expect(userMoveRefusal("running", "completed")).toBe(
      "running → completed is not a user move; tasks complete when their agent finishes",
    );
    expect(userMoveRefusal("pending", "running")).toMatch(/scheduler starts queued tasks/);
    expect(userMoveRefusal("running", "pending")).toMatch(/cancel it instead/);
    expect(userMoveRefusal("failed", "queued")).toMatch(/retry/);
    expect(userMoveRefusal("queued", "cancelled")).toMatch(/Cancel/);
  });
});

// ------------------------------------------------------------------ BoardService (stubbed)

function task(id: string, status: TaskStatus, patch: Partial<Task> = {}): Task {
  return {
    id,
    executionId: "E1",
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
    changedFiles: [],
    testResults: null,
    attempt: 1,
    previousAttemptId: null,
    startedAt: null,
    completedAt: null,
    ...patch,
  };
}

function stubBoard(opts: {
  status?: ExecutionStatus;
  tasks: Task[];
  approved?: string[];
  executions?: Partial<Execution>[];
}) {
  const key = (e: string, id: string) => `${e}:${id}`;
  const store = new Map(opts.tasks.map((t) => [key(t.executionId, t.id), t]));
  const order: string[] = [];
  const schedule = vi.fn();
  const record = vi.fn();
  const transition = vi.fn((e: string, id: string, to: TaskStatus) => {
    const next = { ...(store.get(key(e, id)) as Task), status: to };
    store.set(key(e, id), next);
    return next;
  });
  const deps: BoardDeps = {
    orchestrator: {
      get: (id: string) => ({ id, status: opts.status ?? "running" }) as Execution,
      list: () => (opts.executions ?? []) as Execution[],
      exclusive: async <T>(_id: string, fn: () => Promise<T> | T) => {
        order.push("exclusive");
        return await fn();
      },
      schedule,
    },
    tasks: {
      get: (e: string, id: string) => {
        const t = store.get(key(e, id));
        if (!t) throw new AppError("NOT_FOUND", `Task ${id} not found`);
        return t;
      },
      list: (e: string) => [...store.values()].filter((t) => t.executionId === e),
      transition,
    },
    approvals: { approvedTaskIds: () => new Set(opts.approved ?? []) },
    audit: { record },
  };
  return { board: new BoardService(deps), schedule, record, transition, order };
}

const ref = (taskId: string) => ({ executionId: "E1", taskId });

describe("BoardService.move", () => {
  it("pending → queued transitions on the execution chain, audits and asks for scheduling", async () => {
    const s = stubBoard({ tasks: [task("T-1", "pending")] });
    const moved = await s.board.move(ref("T-1"), "queued", "user");
    expect(moved.status).toBe("queued");
    expect(s.order).toEqual(["exclusive"]);
    expect(s.transition).toHaveBeenCalledWith("E1", "T-1", "queued");
    expect(s.schedule).toHaveBeenCalledWith("E1");
    expect(s.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: "user",
        action: "task.move",
        targetType: "task",
        targetId: "E1:T-1",
        outcome: "success",
        details: { from: "pending", to: "queued" },
      }),
    );
  });

  it("queued → pending parks the task without scheduling", async () => {
    const s = stubBoard({ tasks: [task("T-1", "queued")] });
    expect((await s.board.move(ref("T-1"), "pending", "user")).status).toBe("pending");
    expect(s.schedule).not.toHaveBeenCalled();
  });

  it("a same-column drop returns the task unchanged", async () => {
    const s = stubBoard({ tasks: [task("T-1", "queued")] });
    expect((await s.board.move(ref("T-1"), "queued", "user")).status).toBe("queued");
    expect(s.transition).not.toHaveBeenCalled();
    expect(s.schedule).not.toHaveBeenCalled();
  });

  it("refuses non-user moves with CONFLICT and audits them as denied", async () => {
    const s = stubBoard({ tasks: [task("T-1", "running")] });
    await expect(s.board.move(ref("T-1"), "completed", "user")).rejects.toMatchObject({
      code: "CONFLICT",
      message: "running → completed is not a user move; tasks complete when their agent finishes",
    });
    expect(s.transition).not.toHaveBeenCalled();
    expect(s.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "task.move", outcome: "denied" }),
    );
  });

  it.each<ExecutionStatus>(["draft", "plan_ready", "completed", "cancelled"])(
    "refuses moves while the execution is %s",
    async (status) => {
      const s = stubBoard({ status, tasks: [task("T-1", "pending")] });
      await expect(s.board.move(ref("T-1"), "queued", "user")).rejects.toMatchObject({
        code: "CONFLICT",
      });
      expect(s.transition).not.toHaveBeenCalled();
    },
  );

  it("allows moves while the execution is held", async () => {
    const s = stubBoard({ status: "paused", tasks: [task("T-1", "pending")] });
    expect((await s.board.move(ref("T-1"), "queued", "user")).status).toBe("queued");
  });

  it("a risky task is queued only after its approval", async () => {
    const risky = task("T-1", "pending", { riskClass: "destructive" });
    const denied = stubBoard({ tasks: [risky] });
    await expect(denied.board.move(ref("T-1"), "queued", "user")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(denied.board.move(ref("T-1"), "queued", "user")).rejects.toThrow(
      "T-1 is destructive and waits for approval; approve it in the inbox to queue it",
    );
    const ok = stubBoard({ tasks: [risky], approved: ["T-1"] });
    expect((await ok.board.move(ref("T-1"), "queued", "user")).status).toBe("queued");
  });

  it("unknown task → NOT_FOUND", async () => {
    const s = stubBoard({ tasks: [] });
    await expect(s.board.move(ref("T-9"), "queued", "user")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("BoardService.list", () => {
  it("tasks across executions, newest execution first, filtered and limited", () => {
    const s = stubBoard({
      tasks: [
        task("T-1", "pending"),
        task("T-2", "queued"),
        task("T-1", "running", { executionId: "E2" }),
      ],
      // Orchestrator.list returns newest first
      executions: [
        { id: "E2", projectId: "P1" },
        { id: "E1", projectId: "P1" },
      ],
    });
    const all = s.board.list({ limit: 500 }).items;
    expect(all.map((t) => `${t.executionId}:${t.id}`)).toEqual(["E2:T-1", "E1:T-1", "E1:T-2"]);
    expect(s.board.list({ limit: 2 }).items).toHaveLength(2);
    expect(s.board.list({ executionId: "E1", limit: 500 }).items.map((t) => t.executionId)).toEqual(
      ["E1", "E1"],
    );
  });
});
