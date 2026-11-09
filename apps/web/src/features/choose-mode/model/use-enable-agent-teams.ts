import { AGENT_TEAMS_ENABLE_CONFIRMATION } from "@nexora/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { executionKeys, runtimeKeys } from "@/entities/execution";
import { teamApi } from "@/entities/team";

/**
 * POST /runtime/agent-teams/enable for the execution's project, then refresh what depends on
 * the flag: this execution's mode options and the runtime environment.
 */
export function useEnableAgentTeams(executionId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => teamApi.enable({ projectId, confirmation: AGENT_TEAMS_ENABLE_CONFIRMATION }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: executionKeys.modes(executionId) }),
        qc.invalidateQueries({ queryKey: runtimeKeys.environment() }),
      ]),
  });
}
