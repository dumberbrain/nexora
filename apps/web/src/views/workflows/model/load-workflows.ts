import { type QueryClient } from "@tanstack/react-query";

import { workflowListQuery } from "@/entities/workflow";

/** Route loader: the workflow list (prefetch — errors show in the view). */
export function loadWorkflows(qc: QueryClient) {
  return qc.prefetchQuery(workflowListQuery());
}
