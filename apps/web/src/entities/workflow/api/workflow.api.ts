import { http } from "@/shared/api";

import {
  type CreateWorkflowInput,
  type GraphValidation,
  type RunWorkflowInput,
  type RunWorkflowResult,
  type WorkflowDetail,
  type WorkflowGraph,
  type WorkflowList,
  type WorkflowRunDetail,
  type WorkflowVersion,
  type WorkflowVersionList,
} from "../model/types";

type Opts = { signal?: AbortSignal };

const wf = (id: string, sub = "") => `/workflows/${encodeURIComponent(id)}${sub}`;

export const workflowApi = {
  /** GET /workflows — definitions incl. built-in templates */
  list: (opts: Opts = {}) => http.get<WorkflowList>("/workflows", opts).then((r) => r.data),

  /** POST /workflows — definition (+ version 1 when a graph is given) */
  create: (input: CreateWorkflowInput) =>
    http.post<WorkflowDetail>("/workflows", input).then((r) => r.data),

  /** GET /workflows/:id — definition + latest version */
  get: (id: string, opts: Opts = {}) => http.get<WorkflowDetail>(wf(id), opts).then((r) => r.data),

  /** GET /workflows/:id/versions — newest first, without graphs */
  versions: (id: string, opts: Opts = {}) =>
    http.get<WorkflowVersionList>(wf(id, "/versions"), opts).then((r) => r.data),

  /** GET /workflows/:id/versions/:v — one immutable version with its graph */
  version: (id: string, version: number, opts: Opts = {}) =>
    http.get<WorkflowVersion>(wf(id, `/versions/${version}`), opts).then((r) => r.data),

  /** POST /workflows/:id/versions → version n+1 (400 VALIDATION_FAILED for invalid graphs) */
  saveVersion: (id: string, graph: WorkflowGraph) =>
    http.post<WorkflowVersion>(wf(id, "/versions"), { graph }).then((r) => r.data),

  /** POST /workflows/validate — checks a draft without saving */
  validate: (graph: WorkflowGraph, opts: Opts = {}) =>
    http.post<GraphValidation>("/workflows/validate", { graph }, opts).then((r) => r.data),

  /** POST /workflows/:id/versions/:v/run → an execution in mode `workflow` */
  run: (id: string, version: number, input: RunWorkflowInput) =>
    http.post<RunWorkflowResult>(wf(id, `/versions/${version}/run`), input).then((r) => r.data),

  /** GET /executions/:id/workflow-run — run + version + latest attempt per node */
  runByExecution: (executionId: string, opts: Opts = {}) =>
    http
      .get<WorkflowRunDetail>(`/executions/${encodeURIComponent(executionId)}/workflow-run`, opts)
      .then((r) => r.data),
};
