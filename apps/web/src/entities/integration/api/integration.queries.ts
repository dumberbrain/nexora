import { queryOptions } from "@tanstack/react-query";

import { integrationApi } from "./integration.api";
import { INTEGRATION_CACHE, integrationKeys } from "./query-keys";
import { type IntegrationFilters } from "../model/types";

export const integrationListQuery = (filters: IntegrationFilters) =>
  queryOptions({
    queryKey: integrationKeys.list(filters),
    queryFn: ({ signal }) => integrationApi.list(filters, { signal }),
    ...INTEGRATION_CACHE,
  });
