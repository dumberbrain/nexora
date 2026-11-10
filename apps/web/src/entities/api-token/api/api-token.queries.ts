import { queryOptions } from "@tanstack/react-query";

import { apiTokenApi } from "./api-token.api";
import { API_TOKEN_CACHE, apiTokenKeys } from "./query-keys";

export const apiTokenListQuery = () =>
  queryOptions({
    queryKey: apiTokenKeys.list(),
    queryFn: ({ signal }) => apiTokenApi.list({ signal }),
    ...API_TOKEN_CACHE,
  });
