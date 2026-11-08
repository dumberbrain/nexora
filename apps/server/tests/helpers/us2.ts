import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { closeDb, openDb, type Db } from "../../src/db/client";
import { createApp } from "../../src/http/app";
import { registerApiRoutes } from "../../src/http/routes";
import { registerApprovalRoutes } from "../../src/http/routes/approvals";
import { registerConsentRoutes } from "../../src/http/routes/consent";
import { registerExecutionRoutes } from "../../src/http/routes/executions";
import { createLogger } from "../../src/lib/logger";
import { EventBus, EventStore } from "../../src/modules/event-manager";
import {
  createOrchestration,
  type Orchestration,
} from "../../src/modules/execution-orchestrator";
import { AuditService } from "../../src/modules/permission-manager/audit.service";
import { createServices, type Services } from "../../src/services";
import { FakeManagedRuntime } from "../fakes/fake-managed-runtime";
import { FakeWorktrees } from "../fakes/fake-worktrees";
import { testEnv } from "./us1";

export interface Us2Harness {
  db: Db;
  bus: EventBus;
  store: EventStore;
  audit: AuditService;
  services: Services;
  orchestration: Orchestration;
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
    JSON.stringify({ devDependencies: { typescript: "5", vitest: "4" }, dependencies: { react: "19" } }),
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

/** US1 services + the US2 orchestration on an in-memory DB, fake runtime and fake worktrees. */
export async function createUs2Harness(): Promise<Us2Harness> {
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
