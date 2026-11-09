import { type QueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { executionDetailQuery, SETUP_STEPS } from "@/entities/execution";
import { projectListQuery } from "@/entities/project";

/** /executions/new?step=…&executionId=… — invalid values are dropped, never thrown. */
export const newExecutionSearchSchema = z.object({
  step: z.enum(SETUP_STEPS).catch("task").default("task"),
  executionId: z.string().min(1).max(128).optional().catch(undefined),
});
export type NewExecutionSearch = z.infer<typeof newExecutionSearchSchema>;

/** Route loader: projects (step 1) and the execution being set up, in parallel. */
export function loadNewExecution(qc: QueryClient, executionId: string | undefined) {
  return Promise.all([
    qc.ensureQueryData(projectListQuery()),
    // prefetch (never throws): an unknown id is reported inside the view, not as a route error
    executionId ? qc.prefetchQuery(executionDetailQuery(executionId)) : null,
  ]);
}
