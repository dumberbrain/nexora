import { type MCP_TOOL_INPUTS, type McpToolName } from "@nexora/contracts";
import { type z } from "zod";

import { type AgentRepository } from "../../modules/agent-registry";
import { type EventStore } from "../../modules/event-manager";
import { type Orchestration } from "../../modules/execution-orchestrator";
import { type ControlService } from "../../modules/execution-orchestrator/controls";
import { type SessionRepository } from "../../modules/session-manager";

/** The existing module services the MCP tools call — nothing MCP-specific lives below this. */
export interface McpServices {
  orchestration: Pick<Orchestration, "orchestrator" | "approvals">;
  controls: Pick<
    ControlService,
    "stopExecution" | "pauseExecution" | "resumeExecution" | "sendToAgent"
  >;
  sessions: Pick<SessionRepository, "list" | "get">;
  agents: Pick<AgentRepository, "list" | "get" | "children">;
  store: Pick<EventStore, "list" | "filesModified">;
  /** base URL of the dashboard (links in results, e.g. the approvals of an execution) */
  publicUrl: string;
}

export interface ToolContext {
  /** audit actor `mcp_client:<token name>` */
  actor: string;
  services: McpServices;
  /** the raw arguments as sent (to tell sent keys from schema defaults) */
  args: Record<string, unknown>;
}

export interface ToolOutput {
  /** returned as `structuredContent` (redacted) */
  structured: Record<string, unknown>;
  /** short human summary, returned as the text content (redacted) */
  text: string;
}

export type ToolInput<N extends McpToolName> = z.output<(typeof MCP_TOOL_INPUTS)[N]>;

export interface ToolDef<N extends McpToolName> {
  title: string;
  description: string;
  run(input: ToolInput<N>, ctx: ToolContext): Promise<ToolOutput> | ToolOutput;
}

export type ToolDefs<N extends McpToolName> = { [K in N]: ToolDef<K> };

/** Dashboard link for one execution (approvals are decided there, never over MCP). */
export function executionUrl(publicUrl: string, executionId: string): string {
  return `${publicUrl.replace(/\/+$/, "")}/executions/${executionId}`;
}
