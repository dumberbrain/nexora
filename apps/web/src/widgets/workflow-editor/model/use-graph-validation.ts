import { useQuery } from "@tanstack/react-query";

import { graphValidationQuery, type GraphIssue, type WorkflowGraph } from "@/entities/workflow";
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";

const DEBOUNCE_MS = 300;

/**
 * Server validation (POST /workflows/validate) of the draft, debounced so dragging a node does
 * not hammer the server.
 */
export function useGraphValidation(graph: WorkflowGraph, enabled: boolean) {
  const debounced = useDebouncedValue(graph, DEBOUNCE_MS);
  const query = useQuery({ ...graphValidationQuery(debounced), enabled });
  const issues: GraphIssue[] = query.data?.issues ?? [];
  return {
    issues,
    checking: query.isFetching || debounced !== graph,
    failed: query.isError,
  };
}
