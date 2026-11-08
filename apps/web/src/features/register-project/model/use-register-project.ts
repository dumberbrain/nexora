import { useMutation, useQueryClient } from "@tanstack/react-query";

import { projectApi, projectKeys } from "@/entities/project";

/** POST /projects → refresh project lists (narrow invalidation). */
export function useRegisterProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: projectApi.register,
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.lists() }),
  });
}
