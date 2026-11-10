import { McpToolNodeConfigSchema } from "@ubuliera/contracts";

import { runSessionNode, type SessionNodeDeps, stepContext } from "./session";
import { type NodeExecutor } from "../executor";

export interface McpToolNodeDeps extends SessionNodeDeps {
  /** discovered MCP server names for the project */
  mcpServers(): Promise<ReadonlySet<string>>;
}

/** Claude Code's tool name for an MCP tool. */
export const mcpToolName = (server: string, tool: string) => `mcp__${server}__${tool}`;

/**
 * `mcp_tool` node → managed session in the worktree (where the project's MCP servers are
 * configured) with only that MCP tool pre-allowed. Ubuliera never calls MCP servers itself (R6).
 */
export function mcpToolExecutor(deps: McpToolNodeDeps): NodeExecutor {
  return async (ctx) => {
    const config = McpToolNodeConfigSchema.parse(ctx.node.config);
    if (!(await deps.mcpServers()).has(config.server)) {
      throw new Error(`MCP server "${config.server}" is not configured for this project`);
    }
    const tool = mcpToolName(config.server, config.tool);
    return runSessionNode(deps, ctx, {
      prompt: [
        ...stepContext(ctx),
        `Use the MCP tool \`${tool}\` (server "${config.server}") for this step and no other MCP tool.`,
        `Your step: ${config.prompt}`,
      ].join("\n\n"),
      allowedTools: [tool],
    });
  };
}
