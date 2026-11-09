import { type QueryClient } from "@tanstack/react-query";
import { z } from "zod";

import {
  workflowDetailQuery,
  workflowVersionQuery,
  workflowVersionsQuery,
} from "@/entities/workflow";

/** /workflows/$workflowId?version=N — invalid values are dropped, never thrown. */
export const workflowEditorSearchSchema = z.object({
  version: z.coerce.number().int().min(1).optional().catch(undefined),
});
export type WorkflowEditorSearch = z.infer<typeof workflowEditorSearchSchema>;

/** Route loader: definition + latest, the version list and (if pinned) that version. */
export function loadWorkflowEditor(qc: QueryClient, workflowId: string, version?: number) {
  return Promise.all([
    qc.prefetchQuery(workflowDetailQuery(workflowId)),
    qc.prefetchQuery(workflowVersionsQuery(workflowId)),
    version ? qc.prefetchQuery(workflowVersionQuery(workflowId, version)) : null,
  ]);
}
