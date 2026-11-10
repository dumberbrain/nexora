import {
  type CreateWorkflowInput,
  type GraphValidation,
  type RunWorkflowInput,
  type RunWorkflowResult,
  type WorkflowDetail,
  type WorkflowGraph,
  type WorkflowList,
  type WorkflowRunDetail,
  type WorkflowSummary,
  type WorkflowVersion,
  type WorkflowVersionList,
} from "@ubuliera/contracts";

import { type ValidationCatalog, validateGraph } from "./graph-validator";
import { BUILT_IN_TEMPLATES } from "./templates";
import { type WorkflowRepository } from "./workflow.repository";
import { AppError } from "../../http/errors";
import { type Logger } from "../../lib/logger";
import { startWorkflowRun, type WorkflowModeDeps } from "../execution-orchestrator/modes/workflow";
import { type Orchestrator } from "../execution-orchestrator/orchestrator";
import { discoverMcpServers } from "../mcp-registry/discovery";
import { type AuditService } from "../permission-manager/audit.service";
import { type ProjectService } from "../project-registry";
import { discoverSkills } from "../skill-registry/discovery";

export interface WorkflowServiceDeps {
  repo: WorkflowRepository;
  orchestrator: Pick<Orchestrator, "launchExternal">;
  projects: Pick<ProjectService, "getRow" | "list">;
  audit: AuditService;
  logger: Logger;
  homeDir: string;
  mode: Omit<WorkflowModeDeps, "repo" | "logger" | "homeDir">;
}

/** Invalid graph → 400 VALIDATION_FAILED; `details` lists the GraphIssues. */
function invalid(validation: GraphValidation): AppError {
  return new AppError("VALIDATION_FAILED", "The workflow graph is invalid", validation.issues);
}

/**
 * Workflows use-cases (T129, contracts/rest-api.md → Workflows): definitions, immutable versions,
 * validation against the discovered skill/MCP catalog, runs in mode `workflow`, run detail and
 * the built-in template seed (T130).
 */
export class WorkflowService {
  constructor(private readonly deps: WorkflowServiceDeps) {}

  list(): WorkflowList {
    return { items: this.deps.repo.listDefinitions() };
  }

  get(id: string): WorkflowDetail {
    const d = this.definition(id);
    return { ...d, latest: this.deps.repo.latestVersion(id) ?? null };
  }

  async create(input: CreateWorkflowInput, actor: string): Promise<WorkflowDetail> {
    let graph: WorkflowGraph | null = null;
    if (input.graph) graph = await this.checked(input.graph);
    const d = this.deps.repo.createDefinition({ name: input.name, description: input.description });
    const latest = graph ? this.deps.repo.insertVersion(d.id, graph) : null;
    this.deps.audit.record({
      actor,
      action: "workflow.create",
      targetType: "workflow",
      targetId: d.id,
      outcome: "success",
      details: { name: d.name, version: latest?.version ?? null },
    });
    return { ...d, latestVersion: latest?.version ?? null, latest };
  }

  versions(id: string): WorkflowVersionList {
    this.definition(id);
    return { items: this.deps.repo.listVersions(id) };
  }

  /** One version with its graph (older versions stay readable and runnable). */
  version(id: string, version: number): WorkflowVersion {
    this.definition(id);
    const v = this.deps.repo.getVersion(id, version);
    if (!v) throw new AppError("NOT_FOUND", "Workflow version not found");
    return v;
  }

  async saveVersion(id: string, graph: unknown, actor: string): Promise<WorkflowVersion> {
    this.definition(id);
    const parsed = await this.checked(graph);
    const v = this.deps.repo.insertVersion(id, parsed);
    this.deps.audit.record({
      actor,
      action: "workflow.save_version",
      targetType: "workflow",
      targetId: id,
      outcome: "success",
      details: { version: v.version, nodes: parsed.nodes.length },
    });
    return v;
  }

  async validate(graph: unknown): Promise<GraphValidation> {
    return validateGraph(graph, await this.globalCatalog()).validation;
  }

  async run(
    id: string,
    version: number,
    input: RunWorkflowInput,
    actor: string,
  ): Promise<RunWorkflowResult> {
    const d = this.definition(id);
    const v = this.deps.repo.getVersion(id, version);
    if (!v) throw new AppError("NOT_FOUND", `Workflow version ${version} not found`);
    const project = this.deps.projects.getRow(input.projectId);
    const { validation } = validateGraph(v.graph, await this.catalogFor([project.rootPath]));
    if (!validation.valid) {
      this.deps.audit.record({
        actor,
        action: "workflow.run",
        targetType: "workflow",
        targetId: id,
        outcome: "denied",
        details: { version, issues: validation.issues.map((i) => i.code) },
      });
      throw invalid(validation);
    }
    const prompt = input.prompt.trim() || `Run workflow "${d.name}" v${v.version}`;
    const { execution, result } = await this.deps.orchestrator.launchExternal(
      { projectId: project.id, prompt, mode: "workflow" },
      actor,
      ({ execution: e, projectRoot, worktreePath }) =>
        startWorkflowRun(
          {
            ...this.deps.mode,
            repo: this.deps.repo,
            logger: this.deps.logger,
            homeDir: this.deps.homeDir,
          },
          { execution: e, projectRoot, worktreePath, version: v, prompt: input.prompt.trim() },
        ),
    );
    this.deps.audit.record({
      actor,
      action: "workflow.run",
      targetType: "workflow",
      targetId: id,
      outcome: "success",
      details: { version, executionId: execution.id, runId: result.id },
    });
    return { executionId: execution.id, run: result };
  }

  runDetail(executionId: string): WorkflowRunDetail {
    const run = this.deps.repo.runOfExecution(executionId);
    if (!run) throw new AppError("NOT_FOUND", "This execution has no workflow run");
    const version = this.deps.repo.getVersionById(run.versionId);
    if (!version) throw new AppError("NOT_FOUND", "Workflow version not found");
    return { run, version, nodes: this.deps.repo.latestNodeRuns(run.id) };
  }

  /** Seed the built-in templates once (idempotent: existing built-ins are left as they are). */
  seedTemplates(): WorkflowSummary[] {
    const seeded: WorkflowSummary[] = [];
    for (const t of BUILT_IN_TEMPLATES) {
      if (this.deps.repo.findBuiltIn(t.name)) continue;
      const { validation, graph } = validateGraph(t.graph);
      if (!graph || !validation.valid) {
        this.deps.logger.error(
          { template: t.name, issues: validation.issues },
          "invalid built-in template",
        );
        continue;
      }
      const d = this.deps.repo.createDefinition({
        name: t.name,
        description: t.description,
        builtIn: true,
      });
      const v = this.deps.repo.insertVersion(d.id, graph);
      seeded.push({ ...d, latestVersion: v.version });
    }
    return seeded;
  }

  // ---------------------------------------------------------------- helpers

  private definition(id: string): WorkflowSummary {
    const d = this.deps.repo.getDefinition(id);
    if (!d) throw new AppError("NOT_FOUND", "Workflow not found");
    return d;
  }

  private async checked(graph: unknown): Promise<WorkflowGraph> {
    const { validation, graph: parsed } = validateGraph(graph, await this.globalCatalog());
    if (!parsed || !validation.valid) throw invalid(validation);
    return parsed;
  }

  /** Skills/MCP servers of every registered project plus the user scope. */
  private globalCatalog(): Promise<ValidationCatalog> {
    return this.catalogFor(this.deps.projects.list().map((p) => p.rootPath));
  }

  private async catalogFor(roots: string[]): Promise<ValidationCatalog> {
    const homeDir = this.deps.homeDir;
    const skills = new Map<string, boolean>();
    const mcpServers = new Set<string>();
    // with no project registered, the user scope is still discovered (projectRoot = home)
    for (const projectRoot of roots.length > 0 ? roots : [homeDir]) {
      for (const item of await discoverSkills({ projectRoot, homeDir })) {
        if (item.kind === "agent_definition") continue;
        skills.set(item.name, (skills.get(item.name) ?? false) || item.executable);
      }
      for (const s of await discoverMcpServers({ projectRoot, homeDir })) mcpServers.add(s.name);
    }
    return { skills, mcpServers };
  }
}
