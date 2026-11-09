import { useMutation, useQueryClient } from "@tanstack/react-query";

import { executionKeys } from "@/entities/execution";
import {
  workflowApi,
  workflowKeys,
  type CreateWorkflowInput,
  type RunWorkflowInput,
  type WorkflowGraph,
} from "@/entities/workflow";

/** POST /workflows/:id/versions → seed version(id, v), refresh the definition + versions + list. */
export function useSaveVersion(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: workflowKeys.save(workflowId),
    mutationFn: (graph: WorkflowGraph) => workflowApi.saveVersion(workflowId, graph),
    onSuccess: (saved) => {
      qc.setQueryData(workflowKeys.version(workflowId, saved.version), saved);
      return Promise.all([
        qc.invalidateQueries({ queryKey: workflowKeys.detail(workflowId) }),
        qc.invalidateQueries({ queryKey: workflowKeys.lists() }),
      ]);
    },
  });
}

/** POST /workflows → seed detail(id) + refresh the list. */
export function useCreateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkflowInput) => workflowApi.create(input),
    onSuccess: (created) => {
      qc.setQueryData(workflowKeys.detail(created.id), created);
      return qc.invalidateQueries({ queryKey: workflowKeys.lists() });
    },
  });
}

/** POST /workflows/:id/versions/:v/run → a new execution in mode `workflow`. */
export function useRunWorkflow(workflowId: string, version: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RunWorkflowInput) => workflowApi.run(workflowId, version, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: executionKeys.lists() }),
  });
}
