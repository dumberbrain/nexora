import { sep } from "node:path";

import { type Execution, ExecutionSchema, ExecutionTasksSchema } from "@ubuliera/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeEnvironment } from "../fakes/fake-managed-runtime";
import { HOST, login } from "../helpers/us1";
import { createUs2Harness, type Us2Harness } from "../helpers/us2";

/*
 * US6 — Agent Teams and Hybrid modes through the execution API (T140), on the fake
 * ManagedRuntime: no `claude` process and no model usage.
 */

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
      "x-ubuliera-csrf": auth.csrf,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const json = async (res: Response) => await res.json();

async function execution(id: string): Promise<Execution> {
  return ExecutionSchema.parse(await json(await get(`/executions/${id}`)));
}
async function tasksOf(id: string) {
  return ExecutionTasksSchema.parse(await json(await get(`/executions/${id}/tasks`)));
}

async function planned(mode: "agent_teams" | "hybrid", prompt: string): Promise<string> {
  const created = await send("POST", "/executions", { projectId, prompt });
  const e = ExecutionSchema.parse(await json(created));
  const set = await send("PUT", `/executions/${e.id}/mode`, { mode, strategy: "plan_first" });
  expect(set.status).toBe(200);
  expect((await send("POST", `/executions/${e.id}/plan`, {})).status).toBe(200);
  return e.id;
}

const TEAM_PROMPT = [
  "1. Add a users endpoint in src/api/users.ts",
  "2. Build the users page in src/web/users.tsx",
].join("\n");

describe("Agent Teams mode", () => {
  it("is refused while Agent Teams are not enabled (no simulated team)", async () => {
    const created = await send("POST", "/executions", { projectId, prompt: TEAM_PROMPT });
    const e = ExecutionSchema.parse(await json(created));
    const res = await send("PUT", `/executions/${e.id}/mode`, {
      mode: "agent_teams",
      strategy: "plan_first",
    });
    expect(res.status).toBe(422);
    expect(h.runtime.sessions).toHaveLength(0);
  });

  it("runs every task under ONE interactive lead in the execution worktree", async () => {
    h.runtime.env = fakeEnvironment({ agentTeams: true });
    const id = await planned("agent_teams", TEAM_PROMPT);
    expect((await tasksOf(id)).items.every((t) => t.mode === "agent_teams")).toBe(true);
    const approved = ExecutionSchema.parse(
      await json(await send("POST", `/executions/${id}/approve`, {})),
    );

    await vi.waitFor(() => expect(h.runtime.sessions).toHaveLength(1));
    const lead = h.runtime.sessions[0];
    expect(lead?.input.runtime).toBe("agent_team_pty");
    expect(lead?.kind).toBe("agent_team_pty");
    expect(lead?.input.taskId).toBeNull();
    expect(lead?.input.executionMode).toBe("agent_teams");
    expect(lead?.input.cwd).toBe(approved.worktreePath);
    expect(lead?.input.cwd.startsWith(`${h.root}${sep}.ubuliera${sep}worktrees`)).toBe(true);
    expect(lead?.input.prompt).toMatch(/agent team/i);
    expect(lead?.input.prompt).toMatch(/T-1: Add a users endpoint/);
    expect(lead?.input.prompt).toMatch(/T-2: Build the users page/);
    await vi.waitFor(async () =>
      expect((await tasksOf(id)).items.map((t) => t.status)).toEqual(["running", "running"]),
    );

    // workspace-trust dialog: tasks wait for the user, then continue once it is answered
    lead?.setWaiting(true);
    await vi.waitFor(async () =>
      expect((await tasksOf(id)).items.map((t) => t.status)).toEqual([
        "waiting_for_input",
        "waiting_for_input",
      ]),
    );
    lead?.setWaiting(false);
    await vi.waitFor(async () =>
      expect((await tasksOf(id)).items.map((t) => t.status)).toEqual(["running", "running"]),
    );

    lead?.finish("completed", "Both tasks done; team cleaned up.");
    await vi.waitFor(async () => expect((await execution(id)).status).toBe("completed"));
    expect((await tasksOf(id)).items.map((t) => t.status)).toEqual(["completed", "completed"]);
    // the interactive lead process is ended once its team finished
    expect(lead?.stopped).toBe(true);
  });
});

const HYBRID_PROMPT = [
  "1. Add a users endpoint in src/api/users.ts",
  "2. Investigate the flaky checkout with a team of teammates debating competing hypotheses",
  "3. Review the whole codebase for security issues",
].join("\n");

describe("Hybrid mode", () => {
  it("plans a mechanism + reason per task and dispatches each to its executor", async () => {
    h.runtime.env = fakeEnvironment({ agentTeams: true });
    const id = await planned("hybrid", HYBRID_PROMPT);
    const plan = (await tasksOf(id)).items;
    expect(plan.map((t) => t.mode)).toEqual(["multi_session", "agent_teams", "subagents"]);
    for (const t of plan) expect(t.mechanismReason?.length ?? 0).toBeGreaterThan(20);

    expect((await send("POST", `/executions/${id}/approve`, {})).status).toBe(200);
    // overlapping scopes ("**") are serialised: T-1 → T-2 (team lead) → T-3 (subagents)
    await vi.waitFor(() => expect(h.runtime.sessions).toHaveLength(1));
    const own = h.runtime.sessionFor("T-1");
    expect(own?.input.runtime).toBeUndefined();
    expect(own?.input.ownedPaths).toEqual(["src/api/users.ts"]);
    own?.finish("completed");

    await vi.waitFor(() => expect(h.runtime.sessions).toHaveLength(2));
    const team = h.runtime.sessions[1];
    expect(team?.input.runtime).toBe("agent_team_pty");
    expect(team?.input.taskId).toBeNull();
    expect(team?.input.prompt).toMatch(/T-2/);
    expect(team?.input.prompt).not.toMatch(/T-1:/);
    team?.finish("completed");

    await vi.waitFor(() => expect(h.runtime.sessions).toHaveLength(3));
    const sub = h.runtime.sessions[2];
    expect(sub?.input.runtime).toBeUndefined();
    expect(sub?.input.taskId).toBeNull();
    expect(sub?.input.agents).toBeDefined();
    expect(sub?.input.prompt).toMatch(/T-3/);
    for (const s of h.runtime.sessions) expect(s.input.executionMode).toBe("hybrid");
    sub?.finish("completed");

    await vi.waitFor(async () => expect((await execution(id)).status).toBe("completed"));
    expect(team?.stopped).toBe(true);
    expect(own?.stopped).toBe(false);
  });

  it("never plans Agent Teams when they are unavailable", async () => {
    const id = await planned("hybrid", HYBRID_PROMPT);
    const plan = (await tasksOf(id)).items;
    expect(plan.some((t) => t.mode === "agent_teams")).toBe(false);
    expect(plan[1]?.mode).toBe("subagents");
    expect(plan[1]?.mechanismReason).toMatch(/Agent Teams are unavailable/);
    expect((await send("POST", `/executions/${id}/approve`, {})).status).toBe(200);
    await vi.waitFor(() => expect(h.runtime.sessions.length).toBeGreaterThan(0));
    expect(h.runtime.sessions.some((s) => s.input.runtime === "agent_team_pty")).toBe(false);
  });
});
