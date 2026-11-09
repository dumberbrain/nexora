import { type Execution, type WorkflowRun, type WorkflowVersion } from "@nexora/contracts";

import { type Logger } from "../../../lib/logger";
import { newId } from "../../../lib/ulid";
import { discoverMcpServers } from "../../mcp-registry/discovery";
import { type ApprovalService } from "../../permission-manager/approval.service";
import {
  type AgentDefinitionInput,
  type ManagedRuntime,
  type SessionHandle,
} from "../../runtime-manager/runtime-adapter";
import { discoverSkills } from "../../skill-registry/discovery";
import {
  executeWorkflow,
  type NodeExecutors,
  type WorkflowEventSink,
} from "../../workflow-engine/executor";
import { agentExecutor } from "../../workflow-engine/node-executors/agent";
import { approvalExecutor } from "../../workflow-engine/node-executors/approval";
import { mcpToolExecutor } from "../../workflow-engine/node-executors/mcp-tool";
import { type SessionNodeDeps } from "../../workflow-engine/node-executors/session";
import { skillExecutor } from "../../workflow-engine/node-executors/skill";
import { type WorkflowRepository } from "../../workflow-engine/workflow.repository";
import { type ExternalRun, type LiveSessionInfo } from "../orchestrator";

/**
 * Workflow mode (T129): runs one immutable WorkflowVersion inside an execution created by
 * {@link Orchestrator.launchExternal}. Sessions run in the execution worktree via ManagedRuntime;
 * the orchestrator's stop cancels the run (which stops its sessions and expires its approvals).
 */
export interface WorkflowModeDeps {
  repo: WorkflowRepository;
  runtime: Pick<ManagedRuntime, "startManagedSession">;
  approvals: Pick<ApprovalService, "request" | "requestWorkflowApproval" | "expireRequest">;
  events: WorkflowEventSink;
  logger: Logger;
  homeDir: string;
  now?: () => number;
  /** test seam: replace the node executors */
  executors?: (base: NodeExecutors) => NodeExecutors;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export interface WorkflowStart {
  execution: Execution;
  projectRoot: string;
  worktreePath: string;
  version: WorkflowVersion;
  prompt: string;
}

/** Lazily discovered project catalog, shared by the nodes of one run. */
function projectCatalog(projectRoot: string, homeDir: string) {
  let skills: Promise<Awaited<ReturnType<typeof discoverSkills>>> | null = null;
  let servers: Promise<ReadonlySet<string>> | null = null;
  const items = () => (skills ??= discoverSkills({ projectRoot, homeDir }));
  return {
    skills: async () =>
      new Map<string, boolean>(
        (await items())
          .filter((i) => i.kind !== "agent_definition")
          .map((i) => [i.name, i.executable]),
      ),
    agentDefinitions: async () =>
      new Map<string, AgentDefinitionInput>(
        (await items()).flatMap((i) =>
          i.kind === "agent_definition" && i.definition ? [[i.name, i.definition] as const] : [],
        ),
      ),
    mcpServers: () =>
      (servers ??= discoverMcpServers({ projectRoot, homeDir }).then(
        (s) => new Set(s.map((x) => x.name)),
      )),
  };
}

export function startWorkflowRun(
  deps: WorkflowModeDeps,
  input: WorkflowStart,
): { run: ExternalRun; result: WorkflowRun } {
  const now = deps.now ?? Date.now;
  const { execution } = input;
  const run = deps.repo.insertRun({
    id: newId(now()),
    versionId: input.version.id,
    executionId: execution.id,
    status: "pending",
    startedAt: null,
    endedAt: null,
  });

  const live = new Map<string, { handle: SessionHandle; sessionId: string | null }>();
  const sessionDeps: SessionNodeDeps = {
    runtime: deps.runtime,
    approvals: deps.approvals,
    target: {
      executionId: execution.id,
      projectRoot: input.projectRoot,
      worktreePath: input.worktreePath,
      config: execution.config,
      permissionBypass: execution.permissionBypass,
    },
    track: (nodeId, handle) => {
      if (!handle) {
        live.delete(nodeId);
        return;
      }
      const entry = { handle, sessionId: null as string | null };
      live.set(nodeId, entry);
      void handle.sessionId.then(
        (sid) => (entry.sessionId = sid),
        () => undefined,
      );
    },
  };
  const catalog = projectCatalog(input.projectRoot, deps.homeDir);
  const base: NodeExecutors = {
    agent: agentExecutor({ ...sessionDeps, agentDefinitions: catalog.agentDefinitions }),
    skill: skillExecutor({ ...sessionDeps, skills: catalog.skills }),
    mcp_tool: mcpToolExecutor({ ...sessionDeps, mcpServers: catalog.mcpServers }),
    approval: approvalExecutor(deps.approvals),
  };

  const controller = new AbortController();
  const done = executeWorkflow(
    {
      store: deps.repo,
      events: deps.events,
      executors: deps.executors ? deps.executors(base) : base,
      maxParallel: execution.config.maxParallelSessions,
      ...(deps.now ? { now: deps.now } : {}),
      ...(deps.sleep ? { sleep: deps.sleep } : {}),
    },
    { run, graph: input.version.graph, prompt: input.prompt, signal: controller.signal },
  );
  // the executor marks the run `running` synchronously; report that state
  const snapshot = { ...run };
  done.catch((err: unknown) =>
    deps.logger.error({ err, executionId: execution.id, runId: run.id }, "workflow run crashed"),
  );

  const external: ExternalRun = {
    done,
    cancel: async () => {
      controller.abort();
      await done.catch(() => undefined);
    },
    liveSessions: (): LiveSessionInfo[] =>
      [...live.entries()].map(([nodeId, s]) => ({
        key: `workflow:${nodeId}`,
        sessionId: s.sessionId,
        taskIds: [],
        held: false,
        kind: s.handle.kind,
      })),
  };
  return { run: external, result: snapshot };
}
