import { type Integration } from "@nexora/contracts";

export type {
  Integration,
  IntegrationItem,
  IntegrationList,
  IntegrationListQuery,
  McpToolSummary,
} from "@nexora/contracts";

export type IntegrationKind = Integration["kind"];
export type IntegrationHealth = Integration["health"];
export type IntegrationPermission = Integration["permissionStatus"];

/** GET /integrations filters the web sends (a forced refresh is a separate, explicit action). */
export interface IntegrationFilters {
  projectId?: string;
}
