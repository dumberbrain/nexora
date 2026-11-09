import {
  type Task,
  type TaskList,
  TaskListQuerySchema,
  TaskRefSchema,
  TaskStatusSchema,
} from "@nexora/contracts";
import { type Hono } from "hono";
import { z } from "zod";

import { type BoardService } from "../../modules/task-manager/board";
import { type AppBindings } from "../context";
import { readJson } from "../request";

export interface TaskRouteDeps {
  board: Pick<BoardService, "move" | "list">;
}

/**
 * Any task status is accepted here so a drop on a system-owned column gets 409 CONFLICT with the
 * reason (board.ts); only `pending ⇄ queued` (MoveTaskInput) is ever applied.
 */
const MoveBodySchema = z.object({ status: TaskStatusSchema });

/**
 * US4 board (T120, contracts/rest-api.md → Tasks): `PATCH /executions/:executionId/tasks/:taskId/status`
 * (MoveTaskInput → updated Task) and `GET /tasks` (TaskListQuery → TaskList, newest execution
 * first).
 */
export function registerTaskRoutes(api: Hono<AppBindings>, deps: TaskRouteDeps): void {
  api.patch("/executions/:executionId/tasks/:taskId/status", async (c) => {
    const ref = TaskRefSchema.parse({
      executionId: c.req.param("executionId"),
      taskId: c.req.param("taskId"),
    });
    const { status } = MoveBodySchema.parse(await readJson(c));
    return c.json<Task>(await deps.board.move(ref, status, c.get("actor")));
  });

  api.get("/tasks", (c) => {
    const q = TaskListQuerySchema.parse(c.req.query());
    return c.json<TaskList>(deps.board.list(q));
  });
}
