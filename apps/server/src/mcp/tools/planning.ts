import { type ExecutionConfig, type McpStartExecutionResult } from "@nexora/contracts";

import { executionUrl, type ToolDefs } from "./types";

type PlanningTool =
  "analyze_task" | "recommend_execution_mode" | "create_execution_plan" | "start_execution";

/** Only the config keys the client actually sent — schema defaults must not overwrite answers. */
function sentConfig(
  args: Record<string, unknown>,
  parsed: { [K in keyof ExecutionConfig]?: ExecutionConfig[K] | undefined } | undefined,
): Partial<ExecutionConfig> {
  const raw = args.config;
  if (!parsed || raw === null || typeof raw !== "object") return {};
  const sent = Object.keys(raw);
  return Object.fromEntries(
    Object.entries(parsed).filter(([k, v]) => sent.includes(k) && v !== undefined),
  );
}

/** Wizard tools: analyze → modes → plan → start (Orchestrator). */
export const planningTools: ToolDefs<PlanningTool> = {
  analyze_task: {
    title: "Analyze a task",
    description:
      "Analyze a development task for a registered project (local analysis, no model usage). " +
      "Creates a draft execution and returns it with the analysis.",
    async run(input, { actor, services }) {
      const e = await services.orchestration.orchestrator.create(input, actor);
      return {
        structured: e,
        text: `Execution ${e.id} is ${e.status}${e.analysis ? ` (complexity: ${e.analysis.complexity})` : ""}.`,
      };
    },
  },

  recommend_execution_mode: {
    title: "Recommend an execution mode",
    description:
      "List the execution modes for an analyzed execution with availability, the recommended " +
      "one and why.",
    async run({ executionId }, { services }) {
      const items = await services.orchestration.orchestrator.modes(executionId);
      const recommended = items.find((m) => m.recommended);
      return {
        structured: { items },
        text: recommended
          ? `Recommended mode: ${recommended.mode}. ${recommended.reason}`
          : `${items.filter((m) => m.available).length} of ${items.length} modes available.`,
      };
    },
  },

  create_execution_plan: {
    title: "Create an execution plan",
    description:
      "Choose the mode and strategy (optionally config) and generate a local, heuristic plan. " +
      "Model-backed planning needs consent in the dashboard and is not available over MCP.",
    async run({ executionId, mode, strategy, config }, { actor, services, args }) {
      const o = services.orchestration.orchestrator;
      await o.setMode(executionId, { mode, strategy }, actor);
      const patch = sentConfig(args, config);
      if (Object.keys(patch).length > 0) await o.updateConfig(executionId, patch, actor);
      const plan = await o.generatePlan(
        executionId,
        { modelAssisted: false, consent: false, rememberConsentForProject: false },
        actor,
      );
      const risky = plan.items.filter((t) => t.riskClass !== "normal").length;
      return {
        structured: plan,
        text:
          `Plan for ${executionId}: ${plan.items.length} task(s)` +
          (risky > 0 ? `, ${risky} risky (need approval in the dashboard).` : "."),
      };
    },
  },

  start_execution: {
    title: "Start an execution",
    description:
      "Start a planned execution. Never approves risky tasks: they wait for a human decision " +
      "in the dashboard and the result is `approval_required` with a link.",
    async run({ executionId }, { actor, services }) {
      const { orchestrator, approvals } = services.orchestration;
      // risky tasks are NEVER approved over MCP (contracts/mcp-tools.md)
      await orchestrator.approve(
        executionId,
        { approveRiskyTaskIds: [], permissionBypass: false },
        actor,
      );
      const pendingApprovalTaskIds = approvals
        .list("pending", executionId)
        .flatMap((a) => (a.taskId === null ? [] : [a.taskId]));
      const dashboardUrl = executionUrl(services.publicUrl, executionId);
      const result: McpStartExecutionResult = {
        status: pendingApprovalTaskIds.length > 0 ? "approval_required" : "started",
        executionId,
        pendingApprovalTaskIds,
        dashboardUrl,
      };
      return {
        structured: result,
        text:
          result.status === "started"
            ? `Execution ${executionId} started.`
            : `Execution ${executionId} started; ${pendingApprovalTaskIds.length} risky task(s) ` +
              `wait for approval in the dashboard: ${dashboardUrl}`,
      };
    },
  },
};
