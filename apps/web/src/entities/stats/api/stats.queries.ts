import { type Stats } from "@nexora/contracts";
import { queryOptions } from "@tanstack/react-query";

import { http } from "@/shared/api";

import { STATS_CACHE, statsKeys } from "./query-keys";

export const statsApi = {
  current: (opts: { signal?: AbortSignal } = {}) =>
    http.get<Stats>("/stats", opts).then((r) => r.data),
};

export const statsQuery = () =>
  queryOptions({
    queryKey: statsKeys.current(),
    queryFn: ({ signal }) => statsApi.current({ signal }),
    ...STATS_CACHE,
  });
