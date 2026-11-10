import { http } from "@/shared/api";

import { type Settings, type UpdateMcpSettingsInput } from "../model/types";

type Opts = { signal?: AbortSignal };

export const settingsApi = {
  /** GET /settings — MCP state + endpoint and the read-only remote-access status. */
  get: (opts: Opts = {}) => http.get<Settings>("/settings", opts).then((r) => r.data),
  /** PUT /settings/mcp — session cookie only (bearer tokens are refused server-side); audited. */
  updateMcp: (input: UpdateMcpSettingsInput) =>
    http.put<Settings>("/settings/mcp", input).then((r) => r.data),
};
