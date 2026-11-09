import { type IntegrationHealth, type IntegrationItem, type IntegrationKind } from "../model/types";

/** Marker the server's redactor leaves in place of a secret value. */
export const REDACTED_MARKER = "[REDACTED]";

export const INTEGRATION_KIND_LABEL: Record<IntegrationKind, string> = {
  skill: "skill",
  command: "command",
  agent_definition: "agent",
  mcp_server: "mcp server",
  github: "github",
};

/** Tone per health value — always paired with a text label, never color alone. */
export const HEALTH_TONE: Record<IntegrationHealth, string> = {
  ok: "border-phosphor/60 text-phosphor",
  degraded: "border-status-paused/60 text-status-paused",
  down: "border-destructive/60 text-destructive",
  unknown: "border-border text-muted-foreground",
};

export const isRedacted = (value: unknown): boolean =>
  typeof value === "string" && value.includes(REDACTED_MARKER);

/** Split an inventory into the three tabs of the integrations page. */
export function groupIntegrations(items: IntegrationItem[]) {
  return {
    skills: items.filter((i) => i.kind === "skill" || i.kind === "command"),
    agents: items.filter((i) => i.kind === "agent_definition"),
    mcp: items.filter((i) => i.kind === "mcp_server"),
  };
}
