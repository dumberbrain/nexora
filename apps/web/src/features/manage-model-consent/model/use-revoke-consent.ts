import { useMutation, useQueryClient } from "@tanstack/react-query";

import { projectApi, projectKeys } from "@/entities/project";

/** PUT /projects/:id/model-consent `{ alwaysAllow: false }` — revoke "always allow" (FR-008). */
export function useRevokeConsent(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => projectApi.setModelConsent(projectId, { alwaysAllow: false }),
    onSuccess: (consent) => qc.setQueryData(projectKeys.modelConsent(projectId), consent),
  });
}
