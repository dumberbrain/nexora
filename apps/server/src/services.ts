import { type Stats } from "@nexora/contracts";

import { type NexoraEnv } from "./config/env";
import { type Db } from "./db/client";
import { type Logger } from "./lib/logger";
import { AgentRepository, AgentTree } from "./modules/agent-registry";
import { type EventBus, type EventStore } from "./modules/event-manager";
import { HookIngestService } from "./modules/event-manager/hook-ingest.service";
import { StatsService } from "./modules/event-manager/stats.service";
import { type AuditService } from "./modules/permission-manager/audit.service";
import { HookInstaller, ProjectRepository, ProjectService } from "./modules/project-registry";
import {
  gitBranchOf,
  type GitBranchResolver,
  SessionProjection,
  SessionRepository,
} from "./modules/session-manager";

export interface ServicesDeps {
  db: Db;
  env: NexoraEnv;
  bus: EventBus;
  store: EventStore;
  audit: AuditService;
  logger: Logger;
  /** default: `git rev-parse --abbrev-ref HEAD` via the process runner */
  gitBranch?: GitBranchResolver;
  /** where throttled Stats go (the realtime gateway) */
  publishStats?: (stats: Stats) => void;
  statsIntervalMs?: number;
}

/** US1 module graph, shared by the HTTP server and tests. */
export interface Services {
  store: EventStore;
  projectRepo: ProjectRepository;
  projects: ProjectService;
  hookInstaller: HookInstaller;
  sessions: SessionRepository;
  sessionProjection: SessionProjection;
  agents: AgentRepository;
  agentTree: AgentTree;
  ingest: HookIngestService;
  stats: StatsService;
  /** stop timers and bus subscriptions */
  close(): void;
}

export function createServices(deps: ServicesDeps): Services {
  const { db, bus, store, audit, logger } = deps;
  const projectRepo = new ProjectRepository(db);
  const sessions = new SessionRepository(db);
  const agents = new AgentRepository(db);
  const sessionProjection = new SessionProjection({
    sessions,
    projects: projectRepo,
    bus,
    gitBranch: deps.gitBranch ?? gitBranchOf,
    logger,
  });
  const agentTree = new AgentTree(agents, bus);
  const stats = new StatsService(db, (s) => deps.publishStats?.(s), {
    logger,
    ...(deps.statsIntervalMs === undefined ? {} : { intervalMs: deps.statsIntervalMs }),
  });
  const offEvent = bus.onEvent(() => stats.schedule());

  return {
    store,
    projectRepo,
    projects: new ProjectService(projectRepo, audit),
    hookInstaller: new HookInstaller({ repo: projectRepo, audit, publicUrl: deps.env.publicUrl }),
    sessions,
    sessionProjection,
    agents,
    agentTree,
    ingest: new HookIngestService({
      projects: projectRepo,
      sessions: sessionProjection,
      agents: agentTree,
      store,
      logger,
    }),
    stats,
    close: () => {
      offEvent();
      stats.close();
    },
  };
}
