import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

import {
  ExecutionSchema,
  ExecutionTasksSchema,
  RuntimeEnvironmentSchema,
  VerificationSchema,
} from "@ubuliera/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeDb, openDb, type Db } from "../../src/db/client";
import { createApp } from "../../src/http/app";
import { registerApiRoutes } from "../../src/http/routes";
import { createLogger } from "../../src/lib/logger";
import { EventBus, EventStore } from "../../src/modules/event-manager";
import { AuditService } from "../../src/modules/permission-manager/audit.service";
import { createOrchestrationLayer, type OrchestrationLayer } from "../../src/orchestration";
import { createServices, type Services } from "../../src/services";
import { HOST, login, testEnv } from "../helpers/us1";

// Lead wiring (T102): real RuntimeManager + real git worktrees + the test-only scripted adapter.
let db: Db;
let store: EventStore;
let services: Services;
let us2: OrchestrationLayer;
let app: ReturnType<typeof createApp>;
let root: string;
let auth: { cookie: string; csrf: string };

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "ubuliera-wiring-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "test@ubuliera.local");
  git(root, "config", "user.name", "ubuliera test");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "demo" }));
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "init");

  db = openDb({ dataDir: ":memory:" });
  const bus = new EventBus();
  store = new EventStore(db, bus, { batchMs: 5 });
  const audit = new AuditService(db);
  const logger = createLogger({ level: "silent" });
  const env = { ...testEnv, testFakeRuntime: true };
  services = createServices({
    db,
    env,
    bus,
    store,
    audit,
    logger,
    gitBranch: () => Promise.resolve("main"),
    statsIntervalMs: 0,
  });
  us2 = createOrchestrationLayer({ db, env, bus, store, audit, logger, services });
  app = createApp({
    env,
    db,
    startedAt: Date.now(),
    logger,
    registerRoutes: (api) => {
      registerApiRoutes(api, services);
      us2.registerRoutes(api);
    },
  });
  auth = await login(app);
});

afterEach(async () => {
  await us2.close();
  services.close();
  store.close();
  closeDb(db);
  rmSync(root, { recursive: true, force: true });
});

const get = (path: string) =>
  app.request(`/api/v1${path}`, { headers: { ...HOST, cookie: auth.cookie } });
const send = (method: string, path: string, body?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    headers: {
      ...HOST,
      cookie: auth.cookie,
      "content-type": "application/json",
      "x-ubuliera-csrf": auth.csrf,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

describe("US2 server wiring (fake runtime, real git)", () => {
  it("serves the runtime environment", async () => {
    const res = await get("/runtime/environment");
    expect(res.status).toBe(200);
    const env = RuntimeEnvironmentSchema.parse(await res.json());
    expect(env.claude.installed).toBe(true);
  });

  it("runs an execution end to end in a real worktree and reports changed files", async () => {
    const projectId = (await services.projects.register({ rootPath: root }, "user")).id;
    const prompt = "1. Add a users endpoint in src/api/users.ts\n2. Add docs in docs/users.md";
    const created = await send("POST", "/executions", { projectId, prompt });
    expect(created.status).toBe(201);
    const { id } = ExecutionSchema.parse(await created.json());
    expect(
      (
        await send("PUT", `/executions/${id}/mode`, {
          mode: "multi_session",
          strategy: "plan_first",
        })
      ).status,
    ).toBe(200);
    expect((await send("POST", `/executions/${id}/plan`, {})).status).toBe(200);
    const approved = ExecutionSchema.parse(
      await (await send("POST", `/executions/${id}/approve`, {})).json(),
    );
    const wt = approved.worktreePath ?? "";
    expect(wt).toBe(join(root, ".ubuliera", "worktrees", id, "main"));
    expect(existsSync(wt)).toBe(true);
    expect(git(root, "branch", "--list", `ubuliera/${id}`)).toContain(`ubuliera/${id}`);

    await vi.waitFor(
      async () => {
        const e = ExecutionSchema.parse(await (await get(`/executions/${id}`)).json());
        expect(e.status).toBe("completed");
      },
      { timeout: 15_000, interval: 100 },
    );
    const tasks = ExecutionTasksSchema.parse(await (await get(`/executions/${id}/tasks`)).json());
    expect(tasks.items.every((t) => t.status === "completed")).toBe(true);

    const v = VerificationSchema.parse(await (await get(`/executions/${id}/verification`)).json());
    expect(v.completedTaskIds.length).toBe(tasks.items.length);
    expect(v.changedFiles).toEqual(expect.arrayContaining(["docs/users.md", "src/api/users.ts"]));
    // the registered project root itself is untouched
    expect(git(root, "status", "--porcelain")).toBe("");

    const sessions = services.sessions.list({ limit: 50 });
    expect(sessions.length).toBeGreaterThan(0);
    for (const s of sessions) {
      expect(s.observeOnly).toBe(false);
      expect(s.cwd.startsWith(`${root}${sep}.ubuliera${sep}worktrees`)).toBe(true);
    }
  }, 30_000);
});
