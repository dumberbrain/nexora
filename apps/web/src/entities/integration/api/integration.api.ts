import { http } from "@/shared/api";

import { type IntegrationFilters, type IntegrationList } from "../model/types";

type Opts = { signal?: AbortSignal; refresh?: boolean };

export const integrationApi = {
  /**
   * GET /integrations?projectId=&refresh= — read-only inventory. MCP env/header values and
   * tokens are redacted server-side; only key names ever reach the browser.
   */
  list: (filters: IntegrationFilters, { refresh, ...opts }: Opts = {}) => {
    const params: Record<string, string> = {};
    if (filters.projectId) params.projectId = filters.projectId;
    if (refresh) params.refresh = "true";
    return http.get<IntegrationList>("/integrations", { ...opts, params }).then((r) => r.data);
  },
};
