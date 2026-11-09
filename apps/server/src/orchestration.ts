import { type Hono } from "hono";

import { type NexoraEnv } from "./config/env";
import { type Db } from "./db/client";
import { type AppBindings } from "./http/context";
import { registerApprovalRoutes } from "./http/routes/approvals";
import { registerConsentRoutes } from "./http/routes/consent";
import { registerExecutionRoutes } from "./http/routes/executions";
import { registerRuntimeRoutes } from "./http/routes/runtime";
import { type Logger } from "./lib/logger";
import { runCommand } from "./lib/process";
import { type EventBus, type EventStore } from "./modules/event-manager";
import {
  createOrchestration,
  type Orchestration,
  type WorktreeProvider,
} from "./modules/execution-orchestrator";
import { DiffService, WorktreeService } from "./modules/git-workspace";
import { type AuditService } from "./modules/permission-manager/audit.service";
import { AgentSdkAdapter, CliHeadlessAdapter, RuntimeManager } from "./modules/runtime-manager";
import { ScriptedFakeAdapter } from "./modules/runtime-manager/adapters/fake/scripted-fake.adapter";
import { type ClaudeProbe } from "./modules/runtime-manager/environment";
import { gitBranchOf } from "./modules/session-manager";
import { type Services } from "./services";

/**
 * The orchestrator's WorktreeProvider on top of the git-workspace module. `changedFiles` diffs
 * against the commit each worktree was created from, so work the agent committed still counts.
 */
export class GitWorktreeProvider implements WorktreeProvider {
  private readonly baseOf = new Map<string, string>();

  constructor(
    private readonly worktrees = new WorktreeService(),
    private readonly diff = new DiffService(),
  ) {}

  async executionWorktree(repoRoot: string, executionId: string): Promise<string> {
    const wt = await this.worktrees.createExecutionWorktree(repoRoot, executionId);
    await this.rememberBase(wt.path);
    return wt.path;
  }

  async taskWorktree(repoRoot: string, executionId: string, taskId: string): Promise<string> {
    const wt = await this.worktrees.createTaskWorktree(repoRoot, executionId, taskId);
    await this.rememberBase(wt.path);
    return wt.path;
  }

  changedFiles(worktree: string): Promise<string[]> {
    const base = this.baseOf.get(worktree);
    return this.diff.changedFiles(worktree, base ? { base } : {});
  }

  private async rememberBase(worktree: string): Promise<void> {
    if (this.baseOf.has(worktree)) return;
    const head = await runCommand("git", ["rev-parse", "HEAD"], { cwd: worktree });
    this.baseOf.set(worktree, head.stdout.trim());
  }
}

/** Claude CLI probe for the test-only fake runtime: installed, no auth check. */
const fakeClaudeProbe: ClaudeProbe = {
  version: () => Promise.resolve("0.0.0 (fake runtime)"),
  authStatus: () => Promise.resolve({ exitCode: 0, stdout: '{"loggedIn":true}', stderr: "" }),
};

export interface OrchestrationLayerDeps {
  db: Db;
  env: NexoraEnv;
  bus: EventBus;
  store: EventStore;
  audit: AuditService;
  logger: Logger;
  services: Services;
}

/** US2 module graph: runtimes + orchestration + their routes. */
export interface OrchestrationLayer {
  runtime: RuntimeManager;
  orchestration: Orchestration;
  registerRoutes(api: Hono<AppBindings>): void;
  /** stop scheduling, then every managed runtime, then liveness timers */
  close(): Promise<void>;
}

export function createOrchestrationLayer(deps: OrchestrationLayerDeps): OrchestrationLayer {
  const { db, env, bus, store, audit, logger, services } = deps;
  const fake = env.testFakeRuntime;
  const runtime = new RuntimeManager({
    adapters: fake
      ? [new ScriptedFakeAdapter()]
      : [new AgentSdkAdapter(), new CliHeadlessAdapter()],
    sessions: services.sessions,
    projects: services.projectRepo,
    store,
    bus,
    audit,
    logger,
    gitBranch: gitBranchOf,
    projectRoots: () => services.projectRepo.list().map((p) => p.rootPath),
    ...(fake ? { claude: fakeClaudeProbe } : {}),
  });
  const orchestration = createOrchestration({
    db,
    bus,
    store,
    audit,
    logger,
    runtime,
    worktrees: new GitWorktreeProvider(),
    projects: services.projects,
    capabilityOf: (id) => services.sessions.get(id)?.capabilities ?? null,
  });

  return {
    runtime,
    orchestration,
    registerRoutes: (api) => {
      registerRuntimeRoutes(api, { runtime });
      registerExecutionRoutes(api, orchestration);
      registerApprovalRoutes(api, orchestration);
      registerConsentRoutes(api, { consent: orchestration.consent, projects: services.projects });
    },
    close: async () => {
      await orchestration.close();
      await runtime.stopAll();
      runtime.close();
    },
  };
}
