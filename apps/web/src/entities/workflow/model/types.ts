import { type WorkflowNodeRun, type WorkflowVersionList } from "@ubuliera/contracts";

export type {
  CreateWorkflowInput,
  GraphIssue,
  GraphValidation,
  OnError,
  RunWorkflowInput,
  RunWorkflowResult,
  SaveWorkflowVersionInput,
  WorkflowDetail,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowList,
  WorkflowNode,
  WorkflowNodeChangedPayload,
  WorkflowNodeKind,
  WorkflowNodeRun,
  WorkflowRun,
  WorkflowRunDetail,
  WorkflowSummary,
  WorkflowVersion,
  WorkflowVersionList,
} from "@ubuliera/contracts";

/** One row of GET /workflows/:id/versions (no graph). */
export type WorkflowVersionMeta = WorkflowVersionList["items"][number];

export type NodeRunStatus = WorkflowNodeRun["status"];
