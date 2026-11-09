import { type WorkflowNodeRun, type WorkflowVersionList } from "@nexora/contracts";

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
} from "@nexora/contracts";

/** One row of GET /workflows/:id/versions (no graph). */
export type WorkflowVersionMeta = WorkflowVersionList["items"][number];

export type NodeRunStatus = WorkflowNodeRun["status"];
