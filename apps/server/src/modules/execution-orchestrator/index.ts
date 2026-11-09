import { homedir } from "node:os";

import { type RuntimeCapabilityProfile } from "@nexora/contracts";

import { AnalysisService } from "./analysis/analysis.service";
import { ConsentService } from "./consent.service";
import { ExecutionRepository } from "./execution.repository";
import { Orchestrator } from "./orchestrator";
import { type WorktreeProvider } from "./worktree-provider";
import { type Db } from "../../db/client";
import { type Logger } from "../../lib/logger";
import { CommunicationService } from "../communication-manager/communication.service";
import { MessageRepository } from "../communication-manager/message.repository";
import { DomainEmitter } from "../event-manager/domain-emitter";
import { type EventBus } from "../event-manager/event-bus";
import { type EventStore } from "../event-manager/event-store";
import { ApprovalService } from "../permission-manager/approval.service";
import { type AuditService } from "../permission-manager/audit.service";
import { type ProjectService } from "../project-registry";
import { type ManagedRuntime } from "../runtime-manager/runtime-adapter";
import { TaskRepository } from "../task-manager/task.repository";
import { TaskService } from "../task-manager/task.service";

export { Orchestrator } from "./orchestrator";
export { ConsentService } from "./consent.service";
export { type WorktreeProvider } from "./worktree-provider";

export interface OrchestrationDeps {
  db: Db;
  bus: EventBus;
  store: EventStore;
  audit: AuditService;
  logger: Logger;
  /** the RuntimeManager (lead wiring) or the test FakeManagedRuntime */
  runtime: ManagedRuntime;
  /** the git-workspace WorktreeService (lead wiring) or the test FakeWorktrees */
  worktrees: WorktreeProvider;
  projects: ProjectService;
  /** capability profile of a session row (SessionRepository) */
  capabilityOf: (sessionId: string) => RuntimeCapabilityProfile | null;
  /** user home for skill/agent/MCP discovery (default: os.homedir()) */
  homeDir?: string;
}

/** The US2 orchestration module graph (T097–T102). */
export interface Orchestration {
  orchestrator: Orchestrator;
  approvals: ApprovalService;
  consent: ConsentService;
  communication: CommunicationService;
  tasks: TaskService;
  analysis: AnalysisService;
  /** stop scheduling and wait for in-flight work (does NOT stop runtimes — RuntimeManager.stopAll does) */
  close(): Promise<void>;
}

export function createOrchestration(deps: OrchestrationDeps): Orchestration {
  const homeDir = deps.homeDir ?? homedir();
  const emitter = new DomainEmitter(deps.store, deps.bus);
  const approvals = new ApprovalService({ db: deps.db, audit: deps.audit, emitter });
  const consent = new ConsentService(deps.db, deps.audit);
  const tasks = new TaskService({ repo: new TaskRepository(deps.db), emitter });
  const analysis = new AnalysisService({ runtime: deps.runtime, homeDir });
  const communication = new CommunicationService({
    messages: new MessageRepository(deps.db),
    runtime: deps.runtime,
    capabilityOf: deps.capabilityOf,
    emitter,
  });
  const orchestrator = new Orchestrator({
    executions: new ExecutionRepository(deps.db),
    tasks,
    approvals,
    consent,
    analysis,
    communication,
    runtime: deps.runtime,
    worktrees: deps.worktrees,
    projects: deps.projects,
    audit: deps.audit,
    emitter,
    logger: deps.logger,
    homeDir,
  });
  return {
    orchestrator,
    approvals,
    consent,
    communication,
    tasks,
    analysis,
    close: () => orchestrator.close(),
  };
}
