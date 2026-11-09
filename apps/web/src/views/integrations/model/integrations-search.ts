import { UlidSchema } from "@nexora/contracts";
import { type QueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { integrationListQuery, type IntegrationFilters } from "@/entities/integration";
import { projectListQuery } from "@/entities/project";

export const INTEGRATION_TABS = ["skills", "agents", "mcp"] as const;
export type IntegrationTab = (typeof INTEGRATION_TABS)[number];

/** /integrations search params; invalid values are dropped, not fatal. */
export const integrationsSearchSchema = z.object({
  projectId: UlidSchema.optional().catch(undefined),
  tab: z.enum(INTEGRATION_TABS).optional().catch(undefined),
});
export type IntegrationsSearch = z.infer<typeof integrationsSearchSchema>;

/** Drop keys whose value is undefined so URLs and query keys stay canonical. */
export function cleanIntegrationsSearch(search: Record<string, unknown>): IntegrationsSearch {
  return Object.fromEntries(Object.entries(search).filter(([, v]) => v !== undefined));
}

/** The query filters of a page state (the tab only splits the same inventory). */
export const toFilters = ({ projectId }: IntegrationsSearch): IntegrationFilters =>
  projectId ? { projectId } : {};

/** Prefetch the inventory and the project filter options (errors show in the view). */
export function loadIntegrations(qc: QueryClient, search: IntegrationsSearch) {
  return Promise.all([
    qc.prefetchQuery(integrationListQuery(toFilters(search))),
    qc.prefetchQuery(projectListQuery()),
  ]);
}
