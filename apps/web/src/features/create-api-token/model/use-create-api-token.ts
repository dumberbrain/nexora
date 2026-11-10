import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiTokenApi, apiTokenKeys, prependToken, type ApiTokenList } from "@/entities/api-token";

/**
 * POST /tokens. Only `result.token` reaches the query cache; the secret lives in the mutation
 * result alone, which is garbage-collected immediately (gcTime 0) once the caller resets it.
 */
export function useCreateApiToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: apiTokenKeys.create(),
    mutationFn: apiTokenApi.create,
    gcTime: 0,
    onSuccess: async ({ token }) => {
      qc.setQueryData<ApiTokenList>(apiTokenKeys.list(), (list) => prependToken(list, token));
      await qc.invalidateQueries({ queryKey: apiTokenKeys.lists() });
    },
  });
}
