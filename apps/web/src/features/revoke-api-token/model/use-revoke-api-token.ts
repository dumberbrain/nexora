import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiTokenApi, apiTokenKeys, replaceToken, type ApiTokenList } from "@/entities/api-token";

/** DELETE /tokens/:id — writes the revoked token in place, then refreshes the list. */
export function useRevokeApiToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: apiTokenKeys.revoke(),
    mutationFn: apiTokenApi.revoke,
    onSuccess: async (token) => {
      qc.setQueryData<ApiTokenList>(apiTokenKeys.list(), (list) => replaceToken(list, token));
      await qc.invalidateQueries({ queryKey: apiTokenKeys.lists() });
    },
  });
}
