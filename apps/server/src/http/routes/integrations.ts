import { type IntegrationList, IntegrationListQuerySchema } from "@ubuliera/contracts";
import { type Hono } from "hono";

import { type IntegrationsService } from "../../modules/skill-registry/integrations.service";
import { type AppBindings } from "../context";

export interface IntegrationRouteDeps {
  integrations: Pick<IntegrationsService, "list">;
}

/**
 * US7 integrations inventory (T146, contracts/rest-api.md → Integrations & GitHub). Read-only;
 * MCP env/header values and tokens never leave the server (FR-052).
 */
export function registerIntegrationRoutes(
  api: Hono<AppBindings>,
  deps: IntegrationRouteDeps,
): void {
  api.get("/integrations", async (c) => {
    const query = IntegrationListQuerySchema.parse(c.req.query());
    return c.json<IntegrationList>(await deps.integrations.list(query));
  });
}
