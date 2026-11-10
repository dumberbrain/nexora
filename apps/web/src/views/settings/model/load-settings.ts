import { type QueryClient } from "@tanstack/react-query";

import { apiTokenListQuery } from "@/entities/api-token";
import { settingsQuery } from "@/entities/settings";

/** Prefetch settings and the token list (errors show in the view). */
export function loadSettings(qc: QueryClient) {
  return Promise.all([qc.prefetchQuery(settingsQuery()), qc.prefetchQuery(apiTokenListQuery())]);
}
