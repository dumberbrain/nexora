import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  integrationApi,
  integrationKeys,
  integrationListQuery,
  type IntegrationFilters,
} from "@/entities/integration";

/**
 * "Refresh": GET /integrations?refresh=true re-runs discovery + health checks on the server;
 * the fresh inventory replaces the cached one in place (no flash of a loading state).
 */
export function useRefreshIntegrations(filters: IntegrationFilters) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: integrationKeys.refresh(),
    mutationFn: () => integrationApi.list(filters, { refresh: true }),
    onSuccess: (data) => qc.setQueryData(integrationListQuery(filters).queryKey, data),
  });
}
