import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type Hono } from "hono";

import { testEnv } from "./us1";
import { closeDb, openDb, type Db } from "../../src/db/client";
import { createApp } from "../../src/http/app";
import { type AppBindings } from "../../src/http/context";
import { registerApiRoutes } from "../../src/http/routes";
import { registerApprovalRoutes } from "../../src/http/routes/approvals";
import { registerConsentRoutes } from "../../src/http/routes/consent";
import { registerControlRoutes, registerMessageRoutes } from "../../src/http/routes/controls";
import { registerExecutionRoutes } from "../../src/http/routes/executions";
import { registerTaskRoutes } from "../../src/http/routes/tasks";
import { createLogger, type Logger } from "../../src/lib/logger";
import { EventBus, EventStore } from "../../src/modules/event-manager";
import { createOrchestration, type Orchestration } from "../../src/modules/execution-orchestrator";
import {
  type ControlService,
  createControls,
} from "../../src/modules/execution-orchestrator/controls";
import { AuditService } from "../../src/modules/permission-manager/audit.service";
import { type BoardService, createBoard } from "../../src/modules/task-manager/board";
import { createServices, type Services } from "../../src/services";
import { FakeManagedRuntime } from "../fakes/fake-managed-runtime";
import { FakeWorktrees } from "../fakes/fake-worktrees";

export interface Us2Harness {
  db: Db;
  bus: EventBus;
  store: EventStore;
  audit: AuditService;
  services: Services;
  orchestration: Orchestration;
  controls: ControlService;
  board: BoardService;
  runtime: FakeManagedRuntime;
  worktrees: FakeWorktrees;
  app: ReturnType<typeof createApp>;
  /** registered project root (temp dir) */
  root: string;
  /** fake user home for discovery */
  home: string;
  close(): Promise<void>;
}

/** Writes a small TypeScript project with instructions, a skill, an agent and an MCP server. */
export function seedProject(root: string): void {
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      devDependencies: { typescript: "5", vitest: "4" },
      dependencies: { react: "19" },
    }),
  );
  writeFileSync(join(root, "CLAUDE.md"), "# Rules\nUse strict TypeScript.");
  mkdirSync(join(root, ".claude", "skills", "release-notes"), { recursive: true });
  writeFileSync(
    join(root, ".claude", "skills", "release-notes", "SKILL.md"),
    "---\nname: release-notes\ndescription: Draft release notes\n---\nBody",
  );
  mkdirSync(join(root, ".claude", "agents"), { recursive: true });
  writeFileSync(
    join(root, ".claude", "agents", "api-guardian.md"),
    "---\nname: api-guardian\ndescription: Reviews public API changes\ntools: Read, Grep\n---\nYou review API changes.",
  );
  writeFileSync(
    join(root, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        postgres: {
          command: "npx",
          args: ["pg-mcp", "postgres://admin:hunter2@db/app"],
          env: { PGPASSWORD: "hunter2" },
        },
      },
    }),
  );
}

export interface Us2HarnessOptions {
  /** the fake runtime writes session rows like RuntimeManager (session controls need them) */
  sessionRows?: boolean;
  /** cap for stopping runtimes (default 4 500 ms) */
  stopTimeoutMs?: number;
  /** extra module graphs on top of US2 (e.g. US5 workflows): returns their route registration */
  extend?: (parts: Us2Parts) => (api: Hono<AppBindings>) => void;
}

/** What an {@link Us2HarnessOptions.extend} hook can build on. */
export interface Us2Parts {
  db: Db;
  bus: EventBus;
  store: EventStore;
  audit: AuditService;
  logger: Logger;
  services: Services;
  orchestration: Orchestration;
  runtime: FakeManagedRuntime;
  home: string;
}

/**
 * US1 services + the US2 orchestration (and the US3 control/message routes, wired the same way
 * as orchestration.ts) on an in-memory DB, fake runtime and fake worktrees.
 */
export async function createUs2Harness(opts: Us2HarnessOptions = {}): Promise<Us2Harness> {
  const db = openDb({ dataDir: ":memory:" });
  const bus = new EventBus();
  const store = new EventStore(db, bus, { batchMs: 5 });
  const audit = new AuditService(db);
  const logger = createLogger({ level: "silent" });
  const services = createServices({
    db,
    env: testEnv,
    bus,
    store,
    audit,
    logger,
    gitBranch: () => Promise.resolve("main"),
    statsIntervalMs: 0,
  });
  const root = mkdtempSync(join(tmpdir(), "nexora-us2-"));
  const home = mkdtempSync(join(tmpdir(), "nexora-us2-home-"));
  seedProject(root);
  const runtime = new FakeManagedRuntime();
  if (opts.sessionRows) runtime.rows = services.sessions;
  const worktrees = new FakeWorktrees();
  const orchestration = createOrchestration({
    db,
    bus,
    store,
    audit,
    logger,
    runtime,
    worktrees,
    projects: services.projects,
    capabilityOf: (id) => services.sessions.get(id)?.capabilities ?? null,
    homeDir: home,
    ...(opts.stopTimeoutMs === undefined ? {} : { stopTimeoutMs: opts.stopTimeoutMs }),
  });
  const controls = createControls({
    orchestration,
    audit,
    runtime,
    sessions: services.sessions,
    agents: services.agents,
  });
  const board = createBoard({
    orchestrator: orchestration.orchestrator,
    tasks: orchestration.tasks,
    approvals: orchestration.approvals,
    audit,
  });
  const extraRoutes = opts.extend?.({
    db,
    bus,
    store,
    audit,
    logger,
    services,
    orchestration,
    runtime,
    home,
  });
  const app = createApp({
    env: testEnv,
    db,
    startedAt: Date.now(),
    logger,
    registerRoutes: (api) => {
      registerApiRoutes(api, services);
      registerExecutionRoutes(api, orchestration);
      registerApprovalRoutes(api, orchestration);
      registerConsentRoutes(api, { consent: orchestration.consent, projects: services.projects });
      registerControlRoutes(api, { controls });
      registerMessageRoutes(api, { communication: orchestration.communication });
      registerTaskRoutes(api, { board });
      extraRoutes?.(api);
    },
  });
  await Promise.resolve();
  return {
    db,
    bus,
    store,
    audit,
    services,
    orchestration,
    controls,
    board,
    runtime,
    worktrees,
    app,
    root,
    home,
    close: async () => {
      await orchestration.close();
      services.close();
      store.close();
      closeDb(db);
      rmSync(root, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    },
  };
}
