import { homedir } from "node:os";

import { WorkflowRepository } from "./workflow.repository";
import { WorkflowService } from "./workflow.service";
import { type Db } from "../../db/client";
import { type Logger } from "../../lib/logger";
import { DomainEmitter } from "../event-manager/domain-emitter";
import { type EventBus } from "../event-manager/event-bus";
import { type EventStore } from "../event-manager/event-store";
import { type Orchestration } from "../execution-orchestrator";
import { type WorkflowModeDeps } from "../execution-orchestrator/modes/workflow";
import { type AuditService } from "../permission-manager/audit.service";
import { type ProjectService } from "../project-registry";
import { type ManagedRuntime } from "../runtime-manager/runtime-adapter";

export { WorkflowService } from "./workflow.service";
export { WorkflowRepository } from "./workflow.repository";
export { validateGraph, type ValidationCatalog } from "./graph-validator";
export { compileCondition, ConditionError } from "./condition-evaluator";
export { executeWorkflow } from "./executor";
export { BUILT_IN_TEMPLATES } from "./templates";

export interface WorkflowEngineDeps {
  db: Db;
  bus: EventBus;
  store: EventStore;
  audit: AuditService;
  logger: Logger;
  orchestration: Pick<Orchestration, "orchestrator" | "approvals">;
  /** the RuntimeManager (lead wiring) or the test FakeManagedRuntime */
  runtime: Pick<ManagedRuntime, "startManagedSession">;
  projects: Pick<ProjectService, "getRow" | "list">;
  /** user home for skill/MCP discovery (default: os.homedir()) */
  homeDir?: string;
  now?: () => number;
  /** test seams for the workflow mode (node executors, backoff sleep) */
  mode?: Pick<WorkflowModeDeps, "executors" | "sleep">;
}

/** The US5 module graph (T126–T130). */
export interface WorkflowEngine {
  service: WorkflowService;
  repo: WorkflowRepository;
  /** seed the built-in templates; idempotent — call once at startup */
  seed(): void;
}

export function createWorkflowEngine(deps: WorkflowEngineDeps): WorkflowEngine {
  const repo = new WorkflowRepository(deps.db, deps.now);
  const service = new WorkflowService({
    repo,
    orchestrator: deps.orchestration.orchestrator,
    projects: deps.projects,
    audit: deps.audit,
    logger: deps.logger,
    homeDir: deps.homeDir ?? homedir(),
    mode: {
      runtime: deps.runtime,
      approvals: deps.orchestration.approvals,
      events: new DomainEmitter(deps.store, deps.bus),
      ...(deps.now ? { now: deps.now } : {}),
      ...deps.mode,
    },
  });
  return { service, repo, seed: () => void service.seedTemplates() };
}
