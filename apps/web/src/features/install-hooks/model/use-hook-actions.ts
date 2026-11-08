import { useMutation, useQueryClient } from "@tanstack/react-query";

import { projectApi, projectKeys } from "@/entities/project";

function useRefreshProject(projectId: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: projectKeys.lists() }),
      qc.invalidateQueries({ queryKey: projectKeys.hookPreview(projectId) }),
    ]);
}

/** POST /projects/:id/hooks/install with `confirm: true` — only ever called from a click. */
export function useInstallHooks(projectId: string) {
  const refresh = useRefreshProject(projectId);
  return useMutation({
    mutationFn: () => projectApi.installHooks(projectId),
    onSuccess: refresh,
  });
}

/** DELETE /projects/:id/hooks — removes only Nexora's entries. */
export function useUninstallHooks(projectId: string) {
  const refresh = useRefreshProject(projectId);
  return useMutation({
    mutationFn: () => projectApi.uninstallHooks(projectId),
    onSuccess: refresh,
  });
}
