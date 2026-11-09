import {
  type IntegrationItem,
  type IntegrationList,
  type IntegrationListQuery,
} from "@nexora/contracts";

import { IntegrationRepository } from "./integration.repository";
import { SkillRegistryService } from "./skill-registry.service";
import { type Db } from "../../db/client";
import { type HealthProbe, McpRegistryService } from "../mcp-registry/mcp-registry.service";

/** Minimal project lookup (ProjectService.getRow throws NOT_FOUND for unknown ids). */
export interface ProjectLookup {
  getRow(id: string): { id: string; rootPath: string };
}

interface Inventories {
  inventory(input: {
    projectRoot: string | null;
    projectId?: string | null;
  }): Promise<IntegrationItem[]>;
}

export interface IntegrationsServiceDeps {
  repo: IntegrationRepository;
  projects: ProjectLookup;
  skills: Inventories;
  mcp: Inventories;
}

interface Snapshot {
  items: IntegrationItem[];
  discoveredAt: number | null;
}

const KIND_ORDER: IntegrationItem["kind"][] = [
  "skill",
  "command",
  "agent_definition",
  "mcp_server",
  "github",
];

/**
 * GET /integrations (T146): skills, commands, agent definitions and MCP servers for a scope
 * (a project, or user-level only). The inventory is cached per scope (memory, backed by the
 * integrations table) and only re-discovered on `refresh=true` or when nothing is stored yet.
 */
export class IntegrationsService {
  private readonly cache = new Map<string, Snapshot>();
  private readonly inFlight = new Map<string, Promise<Snapshot>>();

  constructor(private readonly deps: IntegrationsServiceDeps) {}

  async list(query: IntegrationListQuery): Promise<IntegrationList> {
    const projectId = query.projectId ?? null;
    const root = projectId === null ? null : this.deps.projects.getRow(projectId).rootPath;
    const key = projectId ?? "user";

    let snap = query.refresh ? undefined : (this.cache.get(key) ?? this.load(projectId));
    if (!snap) snap = await this.discover(key, projectId, root);
    const items = query.kind ? snap.items.filter((i) => i.kind === query.kind) : snap.items;
    return { items, discoveredAt: snap.discoveredAt };
  }

  /** stored inventory for the scope, if any */
  private load(projectId: string | null): Snapshot | undefined {
    const items = this.deps.repo.list(projectId);
    if (items.length === 0) return undefined;
    const snap = {
      items: sort(items),
      discoveredAt: Math.max(...items.map((i) => i.discoveredAt)),
    };
    this.cache.set(projectId ?? "user", snap);
    return snap;
  }

  /** concurrent refreshes of one scope share a single discovery run */
  private discover(key: string, projectId: string | null, root: string | null): Promise<Snapshot> {
    const running = this.inFlight.get(key);
    if (running) return running;
    const run = (async () => {
      const input = { projectRoot: root, projectId };
      const [skills, servers] = await Promise.all([
        this.deps.skills.inventory(input),
        this.deps.mcp.inventory(input),
      ]);
      const all = [...skills, ...servers];
      const saved = this.deps.repo.replace(projectId, all);
      const discoveredAt = all.length > 0 ? Math.max(...all.map((i) => i.discoveredAt)) : null;
      const snap = { items: sort(saved), discoveredAt };
      this.cache.set(key, snap);
      return snap;
    })().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, run);
    return run;
  }
}

function sort(items: IntegrationItem[]): IntegrationItem[] {
  return [...items].sort(
    (a, b) =>
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      a.scope.localeCompare(b.scope) ||
      a.name.localeCompare(b.name),
  );
}

/** Factory for the lead's wiring (services.ts). */
export function createIntegrationsService(deps: {
  db: Db;
  projects: ProjectLookup;
  homeDir?: string;
  probe?: HealthProbe;
  now?: () => number;
}): IntegrationsService {
  const opts = {
    ...(deps.homeDir === undefined ? {} : { homeDir: deps.homeDir }),
    ...(deps.now === undefined ? {} : { now: deps.now }),
  };
  return new IntegrationsService({
    repo: new IntegrationRepository(deps.db),
    projects: deps.projects,
    skills: new SkillRegistryService(opts),
    mcp: new McpRegistryService({ ...opts, ...(deps.probe ? { probe: deps.probe } : {}) }),
  });
}
