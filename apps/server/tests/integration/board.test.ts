import {
  type EntityChanged,
  ExecutionSchema,
  ExecutionTasksSchema,
  TaskListSchema,
  TaskSchema,
} from "@ubuliera/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HOST, login } from "../helpers/us1";
import { createUs2Harness, type Us2Harness } from "../helpers/us2";

let h: Us2Harness;
let auth: { cookie: string; csrf: string };
let projectId: string;

beforeEach(async () => {
  h = await createUs2Harness({ sessionRows: true });
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
      "x-ubuliera-csrf": auth.csrf,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const post = (path: string, body?: unknown) => send("POST", path, body);
const move = (id: string, taskId: string, status: string) =>
  send("PATCH", `/executions/${id}/tasks/${taskId}/status`, { status });
const json = async (res: Response) => await res.json();
const error = async (res: Response) =>
  ((await res.json()) as { error: { code: string; message: string } }).error;

const TWO = [
  "1. Add a users endpoint in src/api/users.ts",
  "2. Build the users page in src/web/users.tsx",
].join("\n");

async function tasksOf(id: string) {
  return ExecutionTasksSchema.parse(await json(await get(`/executions/${id}/tasks`))).items;
}
async function statusOf(id: string) {
  return ExecutionSchema.parse(await json(await get(`/executions/${id}`))).status;
}
function audited(action: string, outcome = "success") {
  return h.audit
    .list({ limit: 500 })
    .items.filter((a) => a.action === action && a.outcome === outcome);
}

/** create → multi_session → (sequential) → plan; returns the id with the plan ready. */
async function planned(prompt: string): Promise<string> {
  const created = ExecutionSchema.parse(
    await json(await post("/executions", { projectId, prompt })),
  );
  await send("PUT", `/executions/${created.id}/mode`, {
    mode: "multi_session",
    strategy: "plan_first",
  });
  await send("PUT", `/executions/${created.id}/config`, {
    config: { parallelism: "sequential" },
  });
  expect((await post(`/executions/${created.id}/plan`, {})).status).toBe(200);
  return created.id;
}

/** Sequential run of TWO: T-1 running, T-2 queued (Todo). */
async function running(): Promise<string> {
  const id = await planned(TWO);
  expect((await post(`/executions/${id}/approve`, {})).status).toBe(200);
  await vi.waitFor(() => expect(h.runtime.sessions).toHaveLength(1));
  await vi.waitFor(async () =>
    expect((await tasksOf(id)).map((t) => t.status)).toEqual(["running", "queued"]),
  );
  return id;
}

describe("US4 board (fake ManagedRuntime)", () => {
  it("Todo → Backlog parks a task; Backlog → Todo lets the scheduler start it", async () => {
    const id = await running();
    const patches: EntityChanged[] = [];
    const off = h.bus.onEntityChanged((c) => {
      if (c.kind === "task") patches.push(c);
    });

    const parked = await move(id, "T-2", "pending");
    expect(parked.status).toBe(200);
    expect(TaskSchema.parse(await json(parked)).status).toBe("pending");
    expect(patches).toContainEqual(
      expect.objectContaining({
        id: `${id}:T-2`,
        patch: expect.objectContaining({ status: "pending" }) as unknown,
      }),
    );

    // T-1 finishes; the parked task does not start and the execution keeps running
    h.runtime.sessionFor("T-1")?.finish("completed");
    await vi.waitFor(async () => expect((await tasksOf(id))[0]?.status).toBe("completed"));
    await new Promise((r) => setTimeout(r, 30));
    expect(h.runtime.sessions).toHaveLength(1);
    expect(await statusOf(id)).toBe("running");

    const queued = await move(id, "T-2", "queued");
    expect(TaskSchema.parse(await json(queued)).status).toBe("queued");
    await vi.waitFor(() => expect(h.runtime.sessionFor("T-2")).toBeDefined());
    await vi.waitFor(async () => expect((await tasksOf(id))[1]?.status).toBe("running"));

    h.runtime.sessionFor("T-2")?.finish("completed");
    await vi.waitFor(async () => expect(await statusOf(id)).toBe("completed"));
    const after = await move(id, "T-2", "pending");
    expect(after.status).toBe(409);
    expect((await error(after)).message).toMatch(/completed → pending is not a user move/);

    off();
    expect(audited("task.move")).toHaveLength(2);
    expect(audited("task.move")[0]?.targetId).toMatch(/:T-2$/);
  });

  it("refuses system moves with 409 and a human-readable reason", async () => {
    const id = await running();
    const res = await move(id, "T-1", "completed");
    expect(res.status).toBe(409);
    expect(await error(res)).toMatchObject({
      code: "CONFLICT",
      message: "running → completed is not a user move; tasks complete when their agent finishes",
    });
    expect((await move(id, "T-1", "pending")).status).toBe(409);
    expect((await tasksOf(id))[0]?.status).toBe("running");
    expect(audited("task.move", "denied")).toHaveLength(2);

    expect((await move(id, "T-1", "bogus")).status).toBe(400);
    expect((await send("PATCH", `/executions/${id}/tasks/T-1/status`, {})).status).toBe(400);
    expect((await move(id, "T-99", "queued")).status).toBe(404);
  });

  it("moves are refused before the plan is approved", async () => {
    const id = await planned(TWO);
    const res = await move(id, "T-1", "queued");
    expect(res.status).toBe(409);
    expect((await error(res)).message).toMatch(/once its plan is approved/);
    expect((await tasksOf(id)).map((t) => t.status)).toEqual(["pending", "pending"]);
  });

  it("GET /tasks lists tasks across executions, newest execution first", async () => {
    const older = await planned("Refactor the logger");
    const newer = await planned(TWO);
    const all = TaskListSchema.parse(await json(await get("/tasks"))).items;
    expect(all.map((t) => `${t.executionId === newer ? "new" : "old"}:${t.id}`)).toEqual([
      "new:T-1",
      "new:T-2",
      "old:T-1",
    ]);
    const one = TaskListSchema.parse(await json(await get(`/tasks?executionId=${older}`)));
    expect(one.items.map((t) => t.executionId)).toEqual([older]);
    const byProject = TaskListSchema.parse(await json(await get(`/tasks?projectId=${projectId}`)));
    expect(byProject.items).toHaveLength(3);
    expect(TaskListSchema.parse(await json(await get("/tasks?limit=2"))).items).toHaveLength(2);
    expect((await get("/tasks?limit=0")).status).toBe(400);
  });
});
