import { sep } from "node:path";

import {
  ApprovalListSchema,
  ApprovalRequestSchema,
  type Execution,
  ExecutionListSchema,
  ExecutionSchema,
  ExecutionTasksSchema,
  ModeOptionListSchema,
  QuestionListSchema,
  VerificationSchema,
} from "@nexora/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HOST, login } from "../helpers/us1";
import { createUs2Harness, type Us2Harness } from "../helpers/us2";

let h: Us2Harness;
let auth: { cookie: string; csrf: string };
let projectId: string;

beforeEach(async () => {
  h = await createUs2Harness();
  auth = await login(h.app);
  projectId = (await h.services.projects.register({ rootPath: h.root }, "user")).id;
});
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
      "x-nexora-csrf": auth.csrf,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const json = async (res: Response) => await res.json();
const errorCode = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code;

const PROMPT = [
  "1. Add a users endpoint in src/api/users.ts",
  "2. Build the users page in src/web/users.tsx",
  "3. Deploy the result to production",
].join("\n");

async function execution(id: string): Promise<Execution> {
  return ExecutionSchema.parse(await json(await get(`/executions/${id}`)));
}

async function tasksOf(id: string) {
  return ExecutionTasksSchema.parse(await json(await get(`/executions/${id}/tasks`)));
}

/** POST /executions → mode → config → plan; returns the execution id. */
async function planned(mode: "multi_session" | "subagents", prompt = PROMPT): Promise<string> {
  const created = await send("POST", "/executions", { projectId, prompt });
  expect(created.status).toBe(201);
  const e = ExecutionSchema.parse(await json(created));
  expect(e.status).toBe("awaiting_mode");
  expect(
    (await send("PUT", `/executions/${e.id}/mode`, { mode, strategy: "plan_first" })).status,
  ).toBe(200);
  const plan = await send("POST", `/executions/${e.id}/plan`, {});
  expect(plan.status).toBe(200);
  return e.id;
}

describe("executions flow (fake ManagedRuntime)", () => {
  it("POST /executions validates input and an unknown project is NOT_FOUND", async () => {
    expect((await send("POST", "/executions", { projectId, prompt: "" })).status).toBe(400);
    const res = await send("POST", "/executions", {
      projectId: "01JZZZZZZZZZZZZZZZZZZZZZZZ",
      prompt: "x",
    });
    expect(res.status).toBe(404);
  });

  it("runs the whole wizard: analysis → modes → mode → questions → config → plan → approve → run → verify", async () => {
    // analysis
    const created = await send("POST", "/executions", { projectId, prompt: PROMPT });
    expect(created.status).toBe(201);
    const e = ExecutionSchema.parse(await json(created));
    expect(e.analysis?.modelAssisted).toBe(false);
    expect(ExecutionListSchema.parse(await json(await get("/executions"))).items).toHaveLength(1);

    // modes
    const modes = ModeOptionListSchema.parse(await json(await get(`/executions/${e.id}/modes`)));
    expect(modes.items.find((m) => m.mode === "agent_teams")?.available).toBe(false);
    expect(modes.items.find((m) => m.mode === "multi_session")?.recommended).toBe(true);
    const bad = await send("PUT", `/executions/${e.id}/mode`, {
      mode: "agent_teams",
      strategy: "plan_first",
    });
    expect(await errorCode(bad)).toBe("CAPABILITY_UNSUPPORTED");
    const setMode = await send("PUT", `/executions/${e.id}/mode`, {
      mode: "multi_session",
      strategy: "plan_first",
    });
    expect(ExecutionSchema.parse(await json(setMode)).status).toBe("configuring");

    // questions + config
    const questions = QuestionListSchema.parse(
      await json(await get(`/executions/${e.id}/questions`)),
    );
    expect(questions.items.map((q) => q.key)).toContain("maxParallelSessions");
    const tooMany = await send("PUT", `/executions/${e.id}/config`, {
      config: { maxParallelSessions: 9 },
    });
    expect(tooMany.status).toBe(400);
    const cfg = await send("PUT", `/executions/${e.id}/config`, {
      config: { maxParallelSessions: 2, parallelism: "parallel" },
    });
    expect(ExecutionSchema.parse(await json(cfg)).config.maxParallelSessions).toBe(2);

    // plan (local) — model-backed refused without consent
    expect(
      await errorCode(await send("POST", `/executions/${e.id}/plan`, { modelAssisted: true })),
    ).toBe("APPROVAL_REQUIRED");
    const plan = ExecutionTasksSchema.parse(
      await json(await send("POST", `/executions/${e.id}/plan`, {})),
    );
    expect(plan.items.map((t) => t.id)).toEqual(["T-1", "T-2", "T-3"]);
    expect(plan.items.map((t) => t.status)).toEqual(["pending", "pending", "pending"]);
    expect(plan.items[0]?.ownedPaths).toEqual(["src/api/users.ts"]);
    expect(plan.items[2]?.riskClass).toBe("deploy");
    expect((await execution(e.id)).status).toBe("plan_ready");

    // approve: bypass needs the typed phrase; the deploy task waits in the inbox
    const wrong = await send("POST", `/executions/${e.id}/approve`, {
      permissionBypass: true,
      bypassConfirmation: "yes",
    });
    expect(wrong.status).toBe(400);
    const approved = await send("POST", `/executions/${e.id}/approve`, {});
    expect(approved.status).toBe(200);
    const running = ExecutionSchema.parse(await json(approved));
    expect(running.status).toBe("running");
    expect(running.permissionBypass).toBe(false);
    expect(running.worktreePath).toContain(`${sep}.nexora${sep}worktrees${sep}${e.id}`);

    await vi.waitFor(() => expect(h.runtime.sessions).toHaveLength(2));
    for (const s of h.runtime.sessions) {
      expect(s.input.cwd).not.toBe(h.root);
      expect(s.input.cwd.startsWith(`${h.root}${sep}.nexora${sep}worktrees`)).toBe(true);
      expect(s.input.permissionMode).toBe("default");
      expect(s.input.idleTimeoutMs).toBe(600_000);
    }
    expect(h.runtime.sessions.map((s) => s.input.taskId).sort()).toEqual(["T-1", "T-2"]);
    const inbox = ApprovalListSchema.parse(await json(await get("/approvals?status=pending")));
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0]).toMatchObject({
      taskId: "T-3",
      riskClass: "deploy",
      action: "task.start",
    });
    await vi.waitFor(async () =>
      expect((await tasksOf(e.id)).items.map((t) => t.status)).toEqual([
        "running",
        "running",
        "pending",
      ]),
    );

    // T-1 finishes; approving T-3 queues and starts it
    h.worktrees.changes.set(running.worktreePath ?? "", ["src/api/users.ts"]);
    h.runtime.sessionFor("T-1")?.finish("completed", "Endpoint added");
    await vi.waitFor(async () => expect((await tasksOf(e.id)).items[0]?.status).toBe("completed"));
    const decision = await send("POST", `/approvals/${inbox.items[0]?.id}/decision`, {
      decision: "approve",
    });
    expect(ApprovalRequestSchema.parse(await json(decision)).status).toBe("approved");
    await vi.waitFor(() => expect(h.runtime.sessionFor("T-3")).toBeDefined());

    h.runtime.sessionFor("T-2")?.finish("completed");
    h.runtime.sessionFor("T-3")?.finish("failed", null, "deploy script missing");
    await vi.waitFor(async () => expect((await execution(e.id)).status).toBe("failed"));

    const verification = VerificationSchema.parse(
      await json(await get(`/executions/${e.id}/verification`)),
    );
    expect(verification.completedTaskIds).toEqual(["T-1", "T-2"]);
    expect(verification.failedTaskIds).toEqual(["T-3"]);
    expect(verification.changedFiles).toContain("src/api/users.ts");
    expect(verification.testResults).toBeNull();

    const actions = h.audit.list({ limit: 100 }).items.map((a) => a.action);
    for (const a of [
      "execution.create",
      "execution.set_mode",
      "execution.update_config",
      "execution.plan",
      "execution.approve",
      "approval.decide",
    ]) {
      expect(actions).toContain(a);
    }
    const types = new Set(h.store.list({ limit: 200 }).items.map((ev) => ev.type));
    for (const t of [
      "task.created",
      "task.assigned",
      "task.started",
      "task.completed",
      "task.failed",
    ]) {
      expect(types.has(t as never)).toBe(true);
    }
  });

  it("rejecting a risky task cancels it; the rest completes", async () => {
    const id = await planned("multi_session");
    await send("POST", `/executions/${id}/approve`, {});
    const [pending] = ApprovalListSchema.parse(
      await json(await get("/approvals?status=pending")),
    ).items;
    await send("POST", `/approvals/${pending?.id}/decision`, { decision: "reject", note: "no" });
    await vi.waitFor(() => expect(h.runtime.sessions).toHaveLength(2));
    for (const s of h.runtime.sessions) s.finish("completed");
    await vi.waitFor(async () => expect((await execution(id)).status).toBe("completed"));
    expect((await tasksOf(id)).items.map((t) => t.status)).toEqual([
      "completed",
      "completed",
      "cancelled",
    ]);
  });

  it("approveRiskyTaskIds approves risky tasks up front (audited approval request)", async () => {
    const id = await planned("multi_session");
    const res = await send("POST", `/executions/${id}/approve`, { approveRiskyTaskIds: ["T-3"] });
    expect(res.status).toBe(200);
    expect(
      ApprovalListSchema.parse(await json(await get("/approvals?status=pending"))).items,
    ).toEqual([]);
    await vi.waitFor(() => expect(h.runtime.sessions).toHaveLength(3));
    const bad = await planned("multi_session");
    const notRisky = await send("POST", `/executions/${bad}/approve`, {
      approveRiskyTaskIds: ["T-1"],
    });
    expect(notRisky.status).toBe(400);
  });

  it("permission bypass needs the exact phrase and is recorded", async () => {
    const id = await planned("multi_session", "Refactor the logger");
    const res = await send("POST", `/executions/${id}/approve`, {
      permissionBypass: true,
      bypassConfirmation: "bypass permissions",
    });
    expect(ExecutionSchema.parse(await json(res)).permissionBypass).toBe(true);
    await vi.waitFor(() => expect(h.runtime.sessions).toHaveLength(1));
    expect(h.runtime.sessions[0]?.input.permissionMode).toBe("bypassPermissions");
  });

  it("invalid transitions are CONFLICT", async () => {
    const created = ExecutionSchema.parse(
      await json(await send("POST", "/executions", { projectId, prompt: "Fix it" })),
    );
    expect(await errorCode(await send("POST", `/executions/${created.id}/plan`, {}))).toBe(
      "CONFLICT",
    );
    expect(await errorCode(await send("POST", `/executions/${created.id}/approve`, {}))).toBe(
      "CONFLICT",
    );
  });

  it("subagents mode: one session in the execution worktree with the 8 roles + project agents", async () => {
    const id = await planned("subagents");
    await send("POST", `/executions/${id}/approve`, { approveRiskyTaskIds: ["T-3"] });
    await vi.waitFor(() => expect(h.runtime.sessions).toHaveLength(1));
    const [s] = h.runtime.sessions;
    const e = await execution(id);
    expect(s?.input.cwd).toBe(e.worktreePath);
    expect(s?.input.executionMode).toBe("subagents");
    expect(Object.keys(s?.input.agents ?? {})).toEqual(
      expect.arrayContaining([
        "architect",
        "frontend-developer",
        "backend-developer",
        "database-engineer",
        "qa-engineer",
        "security-reviewer",
        "code-reviewer",
        "devops-engineer",
        "api-guardian",
      ]),
    );
    expect(s?.input.prompt).toContain("T-1");
    expect(s?.input.prompt).toContain("T-3");
    await vi.waitFor(async () =>
      expect((await tasksOf(id)).items.every((t) => t.status === "running")).toBe(true),
    );
    s?.finish("completed", "All done");
    await vi.waitFor(async () => expect((await execution(id)).status).toBe("completed"));
    expect((await tasksOf(id)).items.every((t) => t.status === "completed")).toBe(true);
  });

  it("subagents mode waits for pending risky approvals before starting", async () => {
    const id = await planned("subagents");
    await send("POST", `/executions/${id}/approve`, {});
    await new Promise((r) => setTimeout(r, 20));
    expect(h.runtime.sessions).toHaveLength(0);
    const [pending] = ApprovalListSchema.parse(
      await json(await get("/approvals?status=pending")),
    ).items;
    await send("POST", `/approvals/${pending?.id}/decision`, { decision: "approve" });
    await vi.waitFor(() => expect(h.runtime.sessions).toHaveLength(1));
  });

  it("turn timeout fails the task with reason timeout", async () => {
    const id = await planned("multi_session", "Refactor the logger");
    await send("POST", `/executions/${id}/approve`, {});
    await vi.waitFor(() => expect(h.runtime.sessions).toHaveLength(1));
    const s = h.runtime.sessions[0];
    s?.onTurnTimeout?.({ sessionId: s.id, taskId: "T-1" });
    s?.finish("interrupted", null);
    await vi.waitFor(async () => expect((await execution(id)).status).toBe("failed"));
    const failed = h.store.list({ limit: 100, type: ["task.failed"] }).items[0];
    expect(failed?.payload).toMatchObject({ reason: "timeout" });
  });

  it("an interrupted session leaves its task waiting for input", async () => {
    const id = await planned("multi_session", "Refactor the logger");
    await send("POST", `/executions/${id}/approve`, {});
    await vi.waitFor(() => expect(h.runtime.sessions).toHaveLength(1));
    h.runtime.sessions[0]?.finish("interrupted", null);
    await vi.waitFor(async () =>
      expect((await tasksOf(id)).items[0]?.status).toBe("waiting_for_input"),
    );
    expect((await execution(id)).status).toBe("running");
  });

  it("POST /executions/:id/stop stops every session and cancels open work", async () => {
    const id = await planned("multi_session");
    await send("POST", `/executions/${id}/approve`, {});
    await vi.waitFor(() => expect(h.runtime.sessions).toHaveLength(2));
    const res = await send("POST", `/executions/${id}/stop`);
    expect(ExecutionSchema.parse(await json(res)).status).toBe("cancelled");
    expect(h.runtime.sessions.every((s) => s.stopped)).toBe(true);
    await vi.waitFor(async () =>
      expect((await tasksOf(id)).items.every((t) => t.status === "cancelled")).toBe(true),
    );
    const approvals = ApprovalListSchema.parse(await json(await get("/approvals")));
    expect(approvals.items.every((a) => a.status !== "pending")).toBe(true);
    expect(await errorCode(await send("POST", `/executions/${id}/stop`))).toBe("CONFLICT");
  });

  it("a session that fails to start fails its task instead of crashing", async () => {
    const id = await planned("multi_session", "Refactor the logger");
    h.runtime.failNextStart = new Error("claude not found");
    await send("POST", `/executions/${id}/approve`, {});
    await vi.waitFor(async () => expect((await execution(id)).status).toBe("failed"));
    expect((await tasksOf(id)).items[0]?.status).toBe("failed");
  });

  it("consent routes read and revoke the per-project preference", async () => {
    const put = await send("PUT", `/projects/${projectId}/model-consent`, { alwaysAllow: true });
    expect(await json(put)).toEqual({ projectId, alwaysAllow: true });
    expect(await json(await get(`/projects/${projectId}/model-consent`))).toEqual({
      projectId,
      alwaysAllow: true,
    });
    await send("PUT", `/projects/${projectId}/model-consent`, { alwaysAllow: false });
    expect(h.orchestration.consent.isAlwaysAllowed(projectId)).toBe(false);
  });

  it("GET /approvals validates the status filter", async () => {
    expect((await get("/approvals?status=bogus")).status).toBe(400);
    expect((await get("/executions/not-an-id")).status).toBe(404);
  });
});
