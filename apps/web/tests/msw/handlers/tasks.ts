import {
  type ApiErrorBody,
  MoveTaskInputSchema,
  type Task,
  type TaskList,
  USER_MOVABLE_STATUSES,
} from "@nexora/contracts";
import { http, HttpResponse } from "msw";

import { executionFixtures } from "./executions";

const NOW = Date.UTC(2026, 10, 8, 12, 0, 0);
const X002 = "01JCXK0000000000000000X002";
const X003 = "01JCXK0000000000000000X003";

const task = (p: Pick<Task, "id" | "title" | "status"> & Partial<Task>): Task => ({
  executionId: X002,
  description: `${p.title} — details`,
  assignedAgentRole: "implementer",
  agentId: null,
  mode: "multi_session",
  mechanismReason: null,
  priority: "p2",
  dependsOn: [],
  ownedPaths: ["apps/web/src/**"],
  riskClass: "normal",
  changedFiles: [],
  testResults: null,
  attempt: 1,
  previousAttemptId: null,
  startedAt: null,
  completedAt: null,
  ...p,
});

/** US4 board: every column populated for X002 (running), one finished task for X003. */
export const boardFixtures: Task[] = [
  task({ id: "T-1", title: "Add theme store", status: "pending", priority: "p1" }),
  task({ id: "T-2", title: "Drop legacy settings table", status: "pending", dependsOn: ["T-1"] }),
  task({ id: "T-3", title: "Wire toggle into settings page", status: "queued" }),
  task({ id: "T-4", title: "Persist preference", status: "running", startedAt: NOW - 60_000 }),
  task({ id: "T-5", title: "Review store API", status: "reviewing", startedAt: NOW - 90_000 }),
  task({ id: "T-6", title: "Scaffold settings route", status: "completed", completedAt: NOW }),
  task({ id: "T-7", title: "Migrate old themes", status: "failed", attempt: 2 }),
  task({ id: "T-8", title: "Remove dead CSS", status: "cancelled" }),
  task({ id: "T-1", title: "Fix flaky staleness test", status: "completed", executionId: X003 }),
];

/** The board is stateful so a PATCH is visible to the refetch that follows it. */
let board: Task[] = structuredClone(boardFixtures);

/** Called from tests/setup.ts after every test. */
export function resetTaskBoard(): void {
  board = structuredClone(boardFixtures);
}

const conflict = (message: string): ApiErrorBody => ({ error: { code: "CONFLICT", message } });
const movable = new Set<string>(USER_MOVABLE_STATUSES);

export const taskHandlers = [
  http.get("*/api/v1/tasks", ({ request }) => {
    const q = new URL(request.url).searchParams;
    const executionId = q.get("executionId");
    const projectId = q.get("projectId");
    const inProject = (t: Task) =>
      !projectId || executionFixtures.find((e) => e.id === t.executionId)?.projectId === projectId;
    const items = board.filter(
      (t) => (!executionId || t.executionId === executionId) && inProject(t),
    );
    return HttpResponse.json<TaskList>({ items });
  }),
  // US4 user move: only pending ⇄ queued, everything else 409 with a human-readable reason
  http.patch("*/api/v1/executions/:id/tasks/:taskId/status", async ({ params, request }) => {
    const i = board.findIndex((t) => t.executionId === params.id && t.id === params.taskId);
    const found = board[i];
    if (!found) {
      return HttpResponse.json<ApiErrorBody>(
        { error: { code: "NOT_FOUND", message: "task not found" } },
        { status: 404 },
      );
    }
    const parsed = MoveTaskInputSchema.safeParse(await request.json());
    if (!parsed.success || !movable.has(found.status)) {
      return HttpResponse.json(
        conflict(`${found.id} is ${found.status}; only pending ⇄ queued moves are allowed`),
        { status: 409 },
      );
    }
    const next: Task = { ...found, status: parsed.data.status };
    board = board.map((t, j) => (j === i ? next : t));
    return HttpResponse.json<Task>(next);
  }),
];
