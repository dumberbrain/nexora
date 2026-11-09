import { type Hono } from "hono";

import { type NexoraEnv } from "./config/env";
import { type Db } from "./db/client";
import { type AppBindings } from "./http/context";
import { registerApprovalRoutes } from "./http/routes/approvals";
import { registerConsentRoutes } from "./http/routes/consent";
import { registerControlRoutes, registerMessageRoutes } from "./http/routes/controls";
import { registerExecutionRoutes } from "./http/routes/executions";
import { registerRuntimeRoutes } from "./http/routes/runtime";
import { registerTaskRoutes } from "./http/routes/tasks";
import { registerWorkflowRoutes } from "./http/routes/workflows";
import { type Logger } from "./lib/logger";
import { runCommand } from "./lib/process";
import { type EventBus, type EventStore } from "./modules/event-manager";
import {
  createOrchestration,
  type Orchestration,
  type WorktreeProvider,
} from "./modules/execution-orchestrator";
import { type ControlService, createControls } from "./modules/execution-orchestrator/controls";
import { DiffService, WorktreeService } from "./modules/git-workspace";
import { type AuditService } from "./modules/permission-manager/audit.service";
import {
  AgentSdkAdapter,
  type AgentTeamPtyAdapter,
  agentRegistryTeamSink,
  CliHeadlessAdapter,
  createAgentTeamPtyAdapter,
  RuntimeManager,
} from "./modules/runtime-manager";
import { ScriptedFakeAdapter } from "./modules/runtime-manager/adapters/fake/scripted-fake.adapter";
import { type ClaudeProbe } from "./modules/runtime-manager/environment";
import { gitBranchOf } from "./modules/session-manager";
import { type BoardService, createBoard } from "./modules/task-manager/board";
import { createWorkflowEngine, type WorkflowEngine } from "./modules/workflow-engine";
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
  controls: ControlService;
  board: BoardService;
  workflows: WorkflowEngine;
  /** US6 Agent Teams lead runtime (null with the test-only fake runtime) */
  agentTeams: AgentTeamPtyAdapter | null;
  registerRoutes(api: Hono<AppBindings>): void;
  /** stop scheduling, then every managed runtime, then liveness timers */
  close(): Promise<void>;
}

export function createOrchestrationLayer(deps: OrchestrationLayerDeps): OrchestrationLayer {
  const { db, env, bus, store, audit, logger, services } = deps;
  const fake = env.testFakeRuntime;
  // US6: interactive Agent Teams lead in a PTY; node-pty loads lazily (observe-only if it cannot)
  const agentTeams = fake
    ? null
    : createAgentTeamPtyAdapter({ agents: agentRegistryTeamSink(services.agents, bus) });
  const runtime = new RuntimeManager({
    adapters: fake
      ? [new ScriptedFakeAdapter()]
      : // agent_sdk first: the first adapter is the default runtime
        [new AgentSdkAdapter(), new CliHeadlessAdapter(), ...(agentTeams ? [agentTeams] : [])],
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
  // team hooks (TeammateIdle, TaskCreated, …) reach the lead adapter
  const offHooks = agentTeams ? services.ingest.addObserver((p) => agentTeams.ingestHook(p)) : null;

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

  const workflows = createWorkflowEngine({
    db,
    bus,
    store,
    audit,
    logger,
    orchestration,
    runtime,
    projects: services.projects,
  });
  // built-in templates (spec-driven, TDD feature, review and merge) — idempotent
  workflows.seed();

  return {
    runtime,
    orchestration,
    controls,
    board,
    workflows,
    agentTeams,
    registerRoutes: (api) => {
      registerRuntimeRoutes(api, {
        runtime,
        agentTeams: { projects: services.projects, audit },
        ...(agentTeams ? { teams: agentTeams } : {}),
      });
      registerExecutionRoutes(api, orchestration);
      registerApprovalRoutes(api, orchestration);
      registerConsentRoutes(api, { consent: orchestration.consent, projects: services.projects });
      registerControlRoutes(api, { controls });
      registerMessageRoutes(api, { communication: orchestration.communication });
      registerTaskRoutes(api, { board });
      registerWorkflowRoutes(api, { workflows: workflows.service });
    },
    close: async () => {
      offHooks?.();
      await orchestration.close();
      await runtime.stopAll();
      runtime.close();
    },
  };
}
