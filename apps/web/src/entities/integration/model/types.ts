import { type Integration } from "@ubuliera/contracts";

export type {
  Integration,
  IntegrationItem,
  IntegrationList,
  IntegrationListQuery,
  McpToolSummary,
} from "@ubuliera/contracts";

export type IntegrationKind = Integration["kind"];
export type IntegrationHealth = Integration["health"];
export type IntegrationPermission = Integration["permissionStatus"];

/** GET /integrations filters the web sends (a forced refresh is a separate, explicit action). */
export interface IntegrationFilters {
  projectId?: string;
}
