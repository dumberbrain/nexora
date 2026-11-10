import {
  AgentListQuerySchema,
  type ExecutionTasks,
  SessionListQuerySchema,
  type TaskStatus,
} from "@ubuliera/contracts";

import { executionUrl, type ToolDefs } from "./types";
import { AppError } from "../../http/errors";

type MonitoringTool =
  | "list_sessions"
  | "list_agents"
  | "get_agent_status"
  | "list_tasks"
  | "get_execution_status"
  | "get_execution_logs";

/** Read-only views over sessions, agents, tasks, executions and (redacted) events. */
export const monitoringTools: ToolDefs<MonitoringTool> = {
  list_sessions: {
    title: "List sessions",
    description: "Claude Code sessions (managed and observed), newest activity first.",
    run({ status, executionId }, { services }) {
      const q = SessionListQuerySchema.parse({
        ...(status ? { status: [status] } : {}),
        ...(executionId ? { executionId } : {}),
      });
      const items = services.sessions.list(q);
      return { structured: { items }, text: `${items.length} session(s).` };
    },
  },

  list_agents: {
    title: "List agents",
    description: "Agents of a session or execution (main, subagents, team members).",
    run({ sessionId, executionId }, { services }) {
      const q = AgentListQuerySchema.parse({
        ...(sessionId ? { sessionId } : {}),
        ...(executionId ? { executionId } : {}),
      });
      const items = services.agents.list(q);
      return { structured: { items }, text: `${items.length} agent(s).` };
    },
  },

  get_agent_status: {
    title: "Get agent status",
    description: "One agent with its session, child agents and files it changed.",
    run({ agentId }, { services }) {
      const agent = services.agents.get(agentId);
      if (!agent) throw new AppError("NOT_FOUND", "Agent not found");
      const detail = {
        agent,
        session: services.sessions.get(agent.sessionId) ?? null,
        children: services.agents.children(agent.id),
        filesChanged: services.store.filesModified(
          agent.sessionId,
          agent.kind === "main" ? null : agent.id,
        ),
      };
      return { structured: detail, text: `Agent ${agent.name} is ${agent.status}.` };
    },
  },

  list_tasks: {
    title: "List tasks",
    description: "Tasks of an execution (optionally one status) with plan conflicts.",
    run({ executionId, status }, { services }) {
      const all = services.orchestration.orchestrator.tasks(executionId);
      const result: ExecutionTasks = status
        ? { ...all, items: all.items.filter((t) => t.status === status) }
        : all;
      return { structured: result, text: `${result.items.length} task(s).` };
    },
  },

  get_execution_status: {
    title: "Get execution status",
    description:
      "An execution with task counts by status and the number of pending approvals " +
      "(decided in the dashboard).",
    run({ executionId }, { services }) {
      const { orchestrator, approvals } = services.orchestration;
      const execution = orchestrator.get(executionId);
      const tasks = orchestrator.tasks(executionId).items;
      const byStatus: Partial<Record<TaskStatus, number>> = {};
      for (const t of tasks) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
      const pendingApprovals = approvals.list("pending", executionId).length;
      return {
        structured: {
          execution,
          tasks: { total: tasks.length, byStatus },
          pendingApprovals,
          dashboardUrl: executionUrl(services.publicUrl, executionId),
        },
        text:
          `Execution ${executionId} is ${execution.status}: ${tasks.length} task(s)` +
          (pendingApprovals > 0 ? `, ${pendingApprovals} pending approval(s).` : "."),
      };
    },
  },

  get_execution_logs: {
    title: "Get execution logs",
    description: "Events of an execution, newest first, paged by cursor (secrets redacted).",
    run({ executionId, cursor, limit, severity }, { services }) {
      services.orchestration.orchestrator.get(executionId);
      const page = services.store.list({
        executionId,
        limit,
        ...(cursor ? { cursor } : {}),
        ...(severity ? { severity: [severity] } : {}),
      });
      return {
        structured: page,
        text: `${page.items.length} event(s)` + (page.nextCursor ? "; more with nextCursor." : "."),
      };
    },
  },
};
