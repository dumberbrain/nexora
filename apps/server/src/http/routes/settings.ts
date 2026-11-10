import { type Settings, UpdateMcpSettingsInputSchema } from "@nexora/contracts";
import { type Hono } from "hono";

import { type AuditService } from "../../modules/permission-manager/audit.service";
import { type SettingsService } from "../../modules/permission-manager/settings.service";
import { type AppBindings } from "../context";
import { requireSession } from "../middleware/session-only";
import { readJson } from "../request";

export interface SettingsRouteDeps {
  settings: Pick<SettingsService, "view" | "setMcpEnabled">;
  audit: Pick<AuditService, "record">;
}

/** GET /settings, PUT /settings/mcp (US8). Session cookie only; changes are audited. */
export function registerSettingsRoutes(api: Hono<AppBindings>, deps: SettingsRouteDeps): void {
  api.get("/settings", (c) => {
    requireSession(c, deps.audit, "settings.read", "settings");
    return c.json<Settings>(deps.settings.view());
  });

  api.put("/settings/mcp", async (c) => {
    requireSession(c, deps.audit, "settings.mcp.update", "settings");
    const { enabled } = UpdateMcpSettingsInputSchema.parse(await readJson(c));
    return c.json<Settings>(deps.settings.setMcpEnabled(enabled, c.get("actor")));
  });
}
