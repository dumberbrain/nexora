import {
  AssignTaskInputSchema,
  type Execution,
  type Message,
  type MessageList,
  MessageListQuerySchema,
  RequestReviewInputSchema,
  SendMessageInputSchema,
  type Session,
  type Task,
  TaskControlInputSchema,
  TaskRefSchema,
} from "@nexora/contracts";
import { type Context, type Hono } from "hono";

import { type CommunicationService } from "../../modules/communication-manager/communication.service";
import { type ControlService } from "../../modules/execution-orchestrator/controls";
import { type AppBindings } from "../context";
import { readJson } from "../request";

export interface ControlRouteDeps {
  controls: ControlService;
}

export interface MessageRouteDeps {
  communication: Pick<CommunicationService, "page">;
}

/** Empty body ⇒ {} (controls with optional input are valid without a body). */
async function bodyOrEmpty(c: Context): Promise<unknown> {
  const text = await c.req.text();
  if (text.trim() === "") return {};
  return readJson(c);
}

/**
 * US3 controls (T113, contracts/rest-api.md): executions stop/pause/resume, task
 * cancel/retry/review (`/executions/:executionId/tasks/:taskId/…`), assign task, session
 * stop/interrupt/restart/resume/messages and agent messages. Each returns the updated or created
 * entity; unsupported controls are 422 CAPABILITY_UNSUPPORTED, observed sessions 409.
 */
export function registerControlRoutes(api: Hono<AppBindings>, deps: ControlRouteDeps): void {
  const x = deps.controls;
  const ref = (c: Context) =>
    TaskRefSchema.parse({ executionId: c.req.param("executionId"), taskId: c.req.param("taskId") });

  // executions
  api.post("/executions/:id/stop", async (c) =>
    c.json<Execution>(await x.stopExecution(c.req.param("id"), c.get("actor"))),
  );
  api.post("/executions/:id/pause", async (c) =>
    c.json<Execution>(await x.pauseExecution(c.req.param("id"), c.get("actor"))),
  );
  api.post("/executions/:id/resume", async (c) =>
    c.json<Execution>(await x.resumeExecution(c.req.param("id"), c.get("actor"))),
  );

  // tasks
  api.post("/executions/:id/tasks", async (c) => {
    const input = AssignTaskInputSchema.parse(await readJson(c));
    return c.json<Task>(await x.assignTask(c.req.param("id"), input, c.get("actor")), 201);
  });
  api.post("/executions/:executionId/tasks/:taskId/cancel", async (c) => {
    const input = TaskControlInputSchema.parse(await bodyOrEmpty(c));
    return c.json<Task>(await x.cancelTask(ref(c), input, c.get("actor")));
  });
  api.post("/executions/:executionId/tasks/:taskId/retry", async (c) => {
    const input = TaskControlInputSchema.parse(await bodyOrEmpty(c));
    return c.json<Task>(await x.retryTask(ref(c), input, c.get("actor")), 201);
  });
  api.post("/executions/:executionId/tasks/:taskId/review", async (c) => {
    const input = RequestReviewInputSchema.parse(await bodyOrEmpty(c));
    return c.json<Task>(await x.requestReview(ref(c), input, c.get("actor")), 201);
  });

  // sessions & agents
  api.post("/sessions/:id/stop", async (c) =>
    c.json<Session>(await x.stopSession(c.req.param("id"), c.get("actor"))),
  );
  api.post("/sessions/:id/interrupt", async (c) =>
    c.json<Session>(await x.interruptSession(c.req.param("id"), c.get("actor"))),
  );
  api.post("/sessions/:id/restart", async (c) =>
    c.json<Session>(await x.restartSession(c.req.param("id"), c.get("actor"))),
  );
  api.post("/sessions/:id/resume", async (c) =>
    c.json<Session>(await x.resumeSession(c.req.param("id"), c.get("actor"))),
  );
  api.post("/sessions/:id/messages", async (c) => {
    const { text } = SendMessageInputSchema.parse(await readJson(c));
    return c.json<Message>(await x.sendToSession(c.req.param("id"), text, c.get("actor")), 201);
  });
  api.post("/agents/:id/messages", async (c) => {
    const { text } = SendMessageInputSchema.parse(await readJson(c));
    return c.json<Message>(await x.sendToAgent(c.req.param("id"), text, c.get("actor")), 201);
  });
}

/** Communication Center feed: `GET /messages` (MessageListQuery → MessageList, newest first). */
export function registerMessageRoutes(api: Hono<AppBindings>, deps: MessageRouteDeps): void {
  api.get("/messages", (c) => {
    const q = MessageListQuerySchema.parse(c.req.query());
    return c.json<MessageList>(deps.communication.page(q));
  });
}
