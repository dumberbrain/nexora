import {
  ApprovalListSchema,
  type Execution,
  ExecutionSchema,
  ExecutionTasksSchema,
  MessageListSchema,
  MessageSchema,
  type Session,
  SessionDetailSchema,
  SessionSchema,
  TaskSchema,
  VerificationSchema,
} from "@ubuliera/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EXTERNAL_OBSERVED_CAPABILITIES } from "../../src/modules/session-manager/capabilities";
import { capabilityProfile } from "../fakes/fake-managed-runtime";
import { HOST, login } from "../helpers/us1";
import { createUs2Harness, type Us2Harness, type Us2HarnessOptions } from "../helpers/us2";

let h: Us2Harness;
let auth: { cookie: string; csrf: string };
let projectId: string;

async function setup(opts: Us2HarnessOptions = {}): Promise<void> {
  h = await createUs2Harness({ sessionRows: true, ...opts });
  auth = await login(h.app);
  projectId = (await h.services.projects.register({ rootPath: h.root }, "user")).id;
}

beforeEach(() => setup());
afterEach(() => h.close());

const get = (path: string) =>
  h.app.request(`/api/v1${path}`, { headers: { ...HOST, cookie: auth.cookie } });
const send = (method: string, path: string, body?: unknown) =>
  h.app.request(`/api/v1${path}`, {
    method,
    headers: {
      ...HOST,
      cookie: auth.cookie,
      "content-type": "application/json",
      "x-ubuliera-csrf": auth.csrf,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const post = (path: string, body?: unknown) => send("POST", path, body);
const json = async (res: Response) => await res.json();
const errorCode = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code;

const TWO = [
  "1. Add a users endpoint in src/api/users.ts",
  "2. Build the users page in src/web/users.tsx",
].join("\n");
const ONE = "Refactor the logger";

async function execution(id: string): Promise<Execution> {
  return ExecutionSchema.parse(await json(await get(`/executions/${id}`)));
}
async function tasksOf(id: string) {
  return ExecutionTasksSchema.parse(await json(await get(`/executions/${id}/tasks`))).items;
}
async function session(id: string): Promise<Session> {
  return SessionDetailSchema.parse(await json(await get(`/sessions/${id}`))).session;
}
function audited(action: string, outcome = "success") {
  return h.audit
    .list({ limit: 500 })
    .items.filter((a) => a.action === action && a.outcome === outcome);
}

/** create → multi_session → plan → approve; resolves once `sessions` sessions run. */
async function running(prompt: string, sessions: number): Promise<string> {
  const created = ExecutionSchema.parse(
    await json(await post("/executions", { projectId, prompt })),
  );
  await send("PUT", `/executions/${created.id}/mode`, {
    mode: "multi_session",
    strategy: "plan_first",
  });
  expect((await post(`/executions/${created.id}/plan`, {})).status).toBe(200);
  expect((await post(`/executions/${created.id}/approve`, {})).status).toBe(200);
  await vi.waitFor(() => expect(h.runtime.sessions).toHaveLength(sessions));
  await vi.waitFor(async () =>
    expect((await tasksOf(created.id)).filter((t) => t.status === "running")).toHaveLength(
      sessions,
    ),
  );
  return created.id;
}

describe("US3 controls (fake ManagedRuntime)", () => {
  it("POST /executions/:id/stop stops every runtime within 5 s → sessions stopped, audited", async () => {
    const id = await running(TWO, 2);
    const t0 = Date.now();
    const res = await post(`/executions/${id}/stop`);
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(res.status).toBe(200);
    expect(ExecutionSchema.parse(await json(res)).status).toBe("cancelled");
    for (const s of h.runtime.sessions) {
      expect(s.stopped).toBe(true);
      expect((await session(s.id)).status).toBe("stopped");
    }
    expect((await tasksOf(id)).every((t) => t.status === "cancelled")).toBe(true);
    expect(audited("execution.stop")).toHaveLength(1);
    expect(await errorCode(await post(`/executions/${id}/stop`))).toBe("CONFLICT");
    expect(audited("execution.stop", "denied")).toHaveLength(1);
  });

  it("stop is bounded when a runtime hangs", async () => {
    await h.close();
    await setup({ stopTimeoutMs: 150 });
    const id = await running(ONE, 1);
    h.runtime.hangStop = true;
    const t0 = Date.now();
    const res = await post(`/executions/${id}/stop`);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(ExecutionSchema.parse(await json(res)).status).toBe("cancelled");
  });

  it("pause = Interrupt & hold; resume continues the held sessions", async () => {
    const id = await running(TWO, 2);
    const paused = await post(`/executions/${id}/pause`);
    expect(paused.status).toBe(200);
    expect(ExecutionSchema.parse(await json(paused)).status).toBe("paused");
    expect(h.runtime.sessions.every((s) => s.interrupts === 1 && !s.stopped)).toBe(true);
    await vi.waitFor(async () =>
      expect((await tasksOf(id)).map((t) => t.status)).toEqual([
        "waiting_for_input",
        "waiting_for_input",
      ]),
    );
    expect(await errorCode(await post(`/executions/${id}/pause`))).toBe("CONFLICT");

    const resumed = await post(`/executions/${id}/resume`);
    expect(ExecutionSchema.parse(await json(resumed)).status).toBe("running");
    expect(h.runtime.sessions.every((s) => s.sent.length === 1)).toBe(true);
    expect((await tasksOf(id)).map((t) => t.status)).toEqual(["running", "running"]);

    // the resumed turn is watched again: finishing it completes the execution
    for (const s of h.runtime.sessions) s.finish("completed");
    await vi.waitFor(async () => expect((await execution(id)).status).toBe("completed"));
    expect(audited("execution.pause")).toHaveLength(1);
    expect(audited("execution.resume")).toHaveLength(1);
  });

  it("pause is 422 CAPABILITY_UNSUPPORTED when a runtime cannot interrupt + resume", async () => {
    h.runtime.rowCapabilities = capabilityProfile({ runtime: "cli_headless", canInterrupt: false });
    const id = await running(ONE, 1);
    const res = await post(`/executions/${id}/pause`);
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe("CAPABILITY_UNSUPPORTED");
    expect((await execution(id)).status).toBe("running");
    expect(h.runtime.sessions[0]?.interrupts).toBe(0);
    expect(audited("execution.pause", "denied")).toHaveLength(1);
    expect(await errorCode(await post(`/executions/${id}/resume`))).toBe("CONFLICT");
  });

  it("retry creates attempt+1 linked via previousAttemptId; cancel stops the task's session", async () => {
    const id = await running(TWO, 2);
    h.runtime.sessionFor("T-1")?.finish("failed", null, "tests broke");
    await vi.waitFor(async () => expect((await tasksOf(id))[0]?.status).toBe("failed"));

    expect(await errorCode(await post(`/executions/${id}/tasks/T-2/retry`))).toBe("CONFLICT");
    const retried = await post(`/executions/${id}/tasks/T-1/retry`, { reason: "flaky" });
    expect(retried.status).toBe(201);
    const attempt = TaskSchema.parse(await json(retried));
    expect(attempt).toMatchObject({
      id: "T-3",
      attempt: 2,
      previousAttemptId: "T-1",
      title: (await tasksOf(id))[0]?.title,
      ownedPaths: ["src/api/users.ts"],
    });
    await vi.waitFor(() => expect(h.runtime.sessionFor("T-3")).toBeDefined());
    expect(await errorCode(await post(`/executions/${id}/tasks/T-1/retry`))).toBe("CONFLICT");

    const cancelled = await post(`/executions/${id}/tasks/T-2/cancel`, { reason: "not needed" });
    expect(TaskSchema.parse(await json(cancelled)).status).toBe("cancelled");
    expect(h.runtime.sessionFor("T-2")?.stopped).toBe(true);
    expect(await errorCode(await post(`/executions/${id}/tasks/T-2/cancel`))).toBe("CONFLICT");
    expect((await post(`/executions/${id}/tasks/T-99/cancel`)).status).toBe(404);

    h.runtime.sessionFor("T-3")?.finish("completed");
    await vi.waitFor(async () => expect((await execution(id)).status).toBe("completed"));
    const v = VerificationSchema.parse(await json(await get(`/executions/${id}/verification`)));
    expect(v.completedTaskIds).toEqual(["T-3"]);
    expect(v.failedTaskIds).toEqual([]); // T-1 was superseded by its retry
    expect(audited("task.retry")).toHaveLength(1);
    expect(audited("task.retry", "denied")).toHaveLength(2);
    expect(audited("task.cancel")).toHaveLength(1);
  });

  it("assign an additional task: DAG-checked, scheduled after its dependencies, risky ⇒ approval", async () => {
    const id = await running(ONE, 1);
    expect(
      (await post(`/executions/${id}/tasks`, { title: "Docs", dependsOn: ["T-9"] })).status,
    ).toBe(400);
    expect((await post(`/executions/${id}/tasks`, {})).status).toBe(400);

    const assigned = await post(`/executions/${id}/tasks`, {
      title: "Add logger tests",
      dependsOn: ["T-1"],
      ownedPaths: ["tests/**"],
      assignedAgentRole: "QA Engineer",
    });
    expect(assigned.status).toBe(201);
    expect(TaskSchema.parse(await json(assigned))).toMatchObject({
      id: "T-2",
      status: "queued",
      attempt: 1,
      previousAttemptId: null,
      dependsOn: ["T-1"],
      assignedAgentRole: "QA Engineer",
    });

    const risky = TaskSchema.parse(
      await json(await post(`/executions/${id}/tasks`, { title: "Ship it", riskClass: "deploy" })),
    );
    expect(risky).toMatchObject({ id: "T-3", status: "pending", riskClass: "deploy" });
    const inbox = ApprovalListSchema.parse(await json(await get("/approvals?status=pending")));
    expect(inbox.items.map((a) => a.taskId)).toEqual(["T-3"]);

    expect(h.runtime.sessionFor("T-2")).toBeUndefined();
    h.runtime.sessionFor("T-1")?.finish("completed");
    await vi.waitFor(() => expect(h.runtime.sessionFor("T-2")).toBeDefined());
    expect(audited("task.assign")).toHaveLength(2);
    expect(audited("task.assign", "denied").length + audited("task.assign", "failed").length).toBe(
      1,
    );
  });

  it("request review adds a Code Reviewer task after the reviewed one and a review_request message", async () => {
    const id = await running(ONE, 1);
    const res = await post(`/executions/${id}/tasks/T-1/review`, { note: "check error paths" });
    expect(res.status).toBe(201);
    expect(TaskSchema.parse(await json(res))).toMatchObject({
      id: "T-2",
      assignedAgentRole: "Code Reviewer",
      dependsOn: ["T-1"],
      status: "queued",
    });
    const feed = MessageListSchema.parse(
      await json(await get(`/messages?executionId=${id}&type=review_request`)),
    );
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]).toMatchObject({ taskId: "T-1", type: "review_request" });
    expect(feed.items[0]?.summary).toContain("check error paths");

    h.runtime.sessionFor("T-1")?.finish("completed");
    await vi.waitFor(() => expect(h.runtime.sessionFor("T-2")).toBeDefined());
    expect(h.runtime.sessionFor("T-2")?.input.prompt).toContain("T-1");
    expect(audited("task.review")).toHaveLength(1);
  });

  it("session controls: message, interrupt, resume, restart, stop — each audited", async () => {
    const id = await running(ONE, 1);
    const s = h.runtime.sessions[0];
    if (!s) throw new Error("no session");

    // message → delivered, persisted as Message + message.sent event
    const sent = await post(`/sessions/${s.id}/messages`, {
      text: "Use pino, key sk-ant-abcdefghijklmnop1234",
    });
    expect(sent.status).toBe(201);
    const msg = MessageSchema.parse(await json(sent));
    expect(msg).toMatchObject({ executionId: id, taskId: "T-1", from: { kind: "user" } });
    expect(msg.summary).not.toContain("sk-ant-abcdefghijklmnop1234");
    expect(s.sent).toEqual(["Use pino, key sk-ant-abcdefghijklmnop1234"]);
    await vi.waitFor(() =>
      expect(
        h.store
          .list({ limit: 100, type: ["message.sent"] })
          .items.some((e) => (e.payload as { messageId?: string }).messageId === msg.id),
      ).toBe(true),
    );

    // interrupt → task waits for input; resume → running again
    expect((await post(`/sessions/${s.id}/interrupt`)).status).toBe(200);
    await vi.waitFor(async () => expect((await tasksOf(id))[0]?.status).toBe("waiting_for_input"));
    const resumed = await post(`/sessions/${s.id}/resume`);
    expect(SessionSchema.parse(await json(resumed)).id).toBe(s.id);
    expect((await tasksOf(id))[0]?.status).toBe("running");
    expect(s.sent).toHaveLength(2);
    expect(await errorCode(await post(`/sessions/${s.id}/resume`))).toBe("CONFLICT");

    // restart → old runtime stopped, a new session resumes the conversation for the same task
    const restarted = SessionSchema.parse(await json(await post(`/sessions/${s.id}/restart`)));
    expect(s.stopped).toBe(true);
    expect(restarted.id).not.toBe(s.id);
    expect(restarted.currentTaskId).toBe("T-1");
    const next = h.runtime.sessions[1];
    expect(next?.input.resumeSessionId).toBe(s.id);
    expect(next?.input.cwd).toBe(s.input.cwd);
    expect((await tasksOf(id))[0]?.status).toBe("running");

    // stop → session stopped, its task fails (retryable)
    const stopped = SessionSchema.parse(await json(await post(`/sessions/${restarted.id}/stop`)));
    expect(stopped.status).toBe("stopped");
    await vi.waitFor(async () => expect((await tasksOf(id))[0]?.status).toBe("failed"));
    expect(await errorCode(await post(`/sessions/${restarted.id}/stop`))).toBe("CONFLICT");

    for (const a of [
      "session.message",
      "session.interrupt",
      "session.resume",
      "session.restart",
      "session.stop",
    ]) {
      expect(audited(a).length, a).toBe(1);
    }
    expect(audited("session.resume", "denied")).toHaveLength(1);
  });

  it("unsupported session controls are 422; observed sessions are 409; unknown ones 404", async () => {
    h.runtime.rowCapabilities = capabilityProfile({
      runtime: "cli_headless",
      canInterrupt: false,
      canRestart: false,
    });
    await running(ONE, 1);
    const sid = h.runtime.sessions[0]?.id ?? "";
    for (const c of ["interrupt", "restart"]) {
      const res = await post(`/sessions/${sid}/${c}`);
      expect(res.status, c).toBe(422);
      expect(await errorCode(res)).toBe("CAPABILITY_UNSUPPORTED");
    }
    expect(h.runtime.sessions[0]?.interrupts).toBe(0);
    expect(audited("session.interrupt", "denied")).toHaveLength(1);

    const observed = "11111111-2222-4333-8444-555555555555";
    const ts = Date.now();
    h.services.sessions.insert({
      id: observed,
      executionId: null,
      executionMode: null,
      currentTaskId: null,
      projectId,
      runtime: "external_observed",
      observeOnly: true,
      cwd: h.root,
      gitBranch: null,
      worktreePath: null,
      model: null,
      status: "running",
      capabilities: EXTERNAL_OBSERVED_CAPABILITIES,
      pid: null,
      usage: null,
      lastActivityAt: ts,
      startedAt: ts,
      endedAt: null,
    });
    h.services.agents.insert({
      id: observed,
      sessionId: observed,
      parentAgentId: null,
      kind: "main",
      name: "main",
      role: null,
      definitionPath: null,
      status: "running",
      currentTaskId: null,
      summary: null,
    });
    for (const c of ["stop", "interrupt", "restart", "resume"]) {
      expect(await errorCode(await post(`/sessions/${observed}/${c}`)), c).toBe("CONFLICT");
    }
    expect(await errorCode(await post(`/sessions/${observed}/messages`, { text: "hi" }))).toBe(
      "CONFLICT",
    );
    expect(await errorCode(await post(`/agents/${observed}/messages`, { text: "hi" }))).toBe(
      "CONFLICT",
    );
    expect((await post(`/sessions/nope/stop`)).status).toBe(404);
    expect((await post(`/agents/nope/messages`, { text: "hi" })).status).toBe(404);
    expect((await post(`/sessions/${sid}/messages`, { text: "" })).status).toBe(400);
  });

  it("agent messages reach the main agent directly and subagents through it", async () => {
    const id = await running(ONE, 1);
    const s = h.runtime.sessions[0];
    if (!s) throw new Error("no session");
    h.services.agents.insert({
      id: s.id,
      sessionId: s.id,
      parentAgentId: null,
      kind: "main",
      name: "main",
      role: null,
      definitionPath: null,
      status: "running",
      currentTaskId: "T-1",
      summary: null,
    });
    h.services.agents.insert({
      id: "toolu_sub1",
      sessionId: s.id,
      parentAgentId: s.id,
      kind: "subagent",
      name: "qa-engineer",
      role: "QA Engineer",
      definitionPath: null,
      status: "running",
      currentTaskId: "T-1",
      summary: null,
    });
    const direct = MessageSchema.parse(
      await json(await post(`/agents/${s.id}/messages`, { text: "status?" })),
    );
    expect(direct.to).toEqual({ kind: "agent", agentId: s.id });
    const relayed = MessageSchema.parse(
      await json(await post(`/agents/toolu_sub1/messages`, { text: "add edge cases" })),
    );
    expect(relayed).toMatchObject({
      executionId: id,
      to: { kind: "agent", agentId: "toolu_sub1" },
    });
    expect(s.sent).toHaveLength(2);
    expect(s.sent[1]).toContain("qa-engineer");
    expect(s.sent[1]).toContain("add edge cases");
    expect(audited("agent.message")).toHaveLength(2);
  });

  it("GET /messages pages newest first with a cursor and validates the query", async () => {
    const id = await running(ONE, 1);
    const sid = h.runtime.sessions[0]?.id ?? "";
    for (const text of ["one", "two", "three"]) {
      expect((await post(`/sessions/${sid}/messages`, { text })).status).toBe(201);
    }
    const first = MessageListSchema.parse(
      await json(await get(`/messages?executionId=${id}&limit=2`)),
    );
    expect(first.items.map((m) => m.summary)).toEqual(["three", "two"]);
    expect(first.nextCursor).toBe(first.items[1]?.id);
    const second = MessageListSchema.parse(
      await json(await get(`/messages?executionId=${id}&limit=2&cursor=${first.nextCursor}`)),
    );
    expect(second.items.map((m) => m.summary)).toEqual(["one"]);
    expect(second.nextCursor).toBeNull();
    const byTask = MessageListSchema.parse(await json(await get(`/messages?taskId=T-1`)));
    expect(byTask.items).toHaveLength(3);
    expect((await get("/messages?limit=0")).status).toBe(400);
    expect((await get("/messages?taskId=nope")).status).toBe(400);
  });
});
