import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import { WORKFLOW_CACHE, WORKFLOW_RUN_CACHE, workflowKeys, workflowRunKeys } from "./query-keys";
import { workflowApi } from "./workflow.api";
import { type WorkflowGraph } from "../model/types";

export const workflowListQuery = () =>
  queryOptions({
    queryKey: workflowKeys.lists(),
    queryFn: ({ signal }) => workflowApi.list({ signal }),
    ...WORKFLOW_CACHE,
  });

export const workflowDetailQuery = (id: string) =>
  queryOptions({
    queryKey: workflowKeys.detail(id),
    queryFn: ({ signal }) => workflowApi.get(id, { signal }),
    ...WORKFLOW_CACHE,
  });

export const workflowVersionsQuery = (id: string) =>
  queryOptions({
    queryKey: workflowKeys.versions(id),
    queryFn: ({ signal }) => workflowApi.versions(id, { signal }),
    ...WORKFLOW_CACHE,
  });

/** Versions are immutable — once fetched, never stale. */
export const workflowVersionQuery = (id: string, version: number) =>
  queryOptions({
    queryKey: workflowKeys.version(id, version),
    queryFn: ({ signal }) => workflowApi.version(id, version, { signal }),
    staleTime: Infinity,
    gcTime: WORKFLOW_CACHE.gcTime,
  });

/** Server-side validation of a draft; the previous result stays visible while the next loads. */
export const graphValidationQuery = (graph: WorkflowGraph) =>
  queryOptions({
    queryKey: workflowKeys.validate(graph),
    queryFn: ({ signal }) => workflowApi.validate(graph, { signal }),
    staleTime: Infinity,
    gcTime: 60_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });

export const workflowRunQuery = (executionId: string) =>
  queryOptions({
    queryKey: workflowRunKeys.byExecution(executionId),
    queryFn: ({ signal }) => workflowApi.runByExecution(executionId, { signal }),
    ...WORKFLOW_RUN_CACHE,
  });
