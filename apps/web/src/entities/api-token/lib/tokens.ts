import { type ApiToken, type ApiTokenList } from "../model/types";

/** `claude mcp add` command that connects Claude Code to Nexora's MCP endpoint with a token. */
export function mcpClientCommand(endpoint: string, secret: string): string {
  return `claude mcp add --transport http nexora ${endpoint} --header "Authorization: Bearer ${secret}"`;
}

export const SCOPE_DESCRIPTION: Record<ApiToken["scope"], string> = {
  read: "status, sessions, agents, tasks and logs only",
  control: "can also plan, start and stop executions; risky tasks still need a human approval",
};

export const isRevoked = (token: ApiToken): boolean => token.revokedAt !== null;

/** Insert a newly created token at the top of a cached list (idempotent). */
export function prependToken(list: ApiTokenList | undefined, token: ApiToken): ApiTokenList {
  const items = (list?.items ?? []).filter((t) => t.id !== token.id);
  return { items: [token, ...items] };
}

/** Replace one token of a cached list in place. */
export function replaceToken(list: ApiTokenList | undefined, token: ApiToken) {
  return list ? { items: list.items.map((t) => (t.id === token.id ? token : t)) } : list;
}
