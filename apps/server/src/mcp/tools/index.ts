import { type McpToolName } from "@ubuliera/contracts";

import { controlTools } from "./control";
import { monitoringTools } from "./monitoring";
import { planningTools } from "./planning";
import { type ToolDefs } from "./types";

/** Every tool of contracts/mcp-tools.md — the type forces exactly the MCP_TOOLS names. */
export const MCP_TOOL_DEFS: ToolDefs<McpToolName> = {
  ...planningTools,
  ...monitoringTools,
  ...controlTools,
};

export { type McpServices, type ToolContext, type ToolDef, type ToolOutput } from "./types";
