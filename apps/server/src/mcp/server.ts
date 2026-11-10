import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import {
  type CallToolResult,
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  type ErrorCode,
  MCP_ENDPOINT_PATH,
  MCP_TOOL_INPUTS,
  MCP_TOOLS,
  type McpToolName,
} from "@ubuliera/contracts";
import { type Hono } from "hono";
import { ZodError } from "zod";

import { type AppBindings } from "../http/context";
import { AppError, errorBody } from "../http/errors";
import { bearerToken } from "../http/middleware/bearer-auth";
import { logger as defaultLogger, type Logger } from "../lib/logger";
import { redactString } from "../lib/redactor";
import { type AuditService } from "../modules/permission-manager/audit.service";
import { type SettingsService } from "../modules/permission-manager/settings.service";
import { type TokenIdentity, type TokenService } from "../modules/permission-manager/token.service";
import { CapabilityUnsupportedError } from "../modules/runtime-manager/errors";
import { SERVER_VERSION } from "../version";
import { MCP_TOOL_DEFS, type McpServices, type ToolDef } from "./tools";

export interface McpDeps extends McpServices {
  audit: Pick<AuditService, "record">;
  tokens: Pick<TokenService, "verify">;
  settings: Pick<SettingsService, "mcpEnabled">;
  logger?: Logger;
}

interface ToolError {
  code: ErrorCode;
  message: string;
  details?: unknown[];
}

const isToolName = (name: string): name is McpToolName => Object.hasOwn(MCP_TOOLS, name);

/**
 * Deep redaction of every string leaf (FR-052). Keys are kept as they are — ids such as
 * `sessionId` are not secrets — and stored events were already redacted on the way in.
 */
export function redactOutput(value: unknown): unknown {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(redactOutput);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactOutput(v)]));
  }
  return value;
}

/** tools/list: names, scopes and zod inputs from contracts, converted by the SDK. */
export function listMcpTools(): Tool[] {
  return (Object.keys(MCP_TOOLS) as McpToolName[]).map((name) => {
    const def = MCP_TOOL_DEFS[name];
    const scope = MCP_TOOLS[name];
    return {
      name,
      title: def.title,
      description: `${def.description} Requires a ${scope} token.`,
      inputSchema: toJsonSchemaCompat(MCP_TOOL_INPUTS[name], {
        pipeStrategy: "input",
      }) as Tool["inputSchema"],
      annotations: { readOnlyHint: scope === "read", openWorldHint: false },
    };
  });
}

function toToolError(err: unknown, log: Logger, tool: string): ToolError {
  if (err instanceof AppError) {
    return {
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    };
  }
  if (err instanceof CapabilityUnsupportedError) {
    return {
      code: err.code,
      message: err.message,
      details: [{ runtime: err.runtime, capability: err.capability }],
    };
  }
  if (err instanceof ZodError) {
    return { code: "VALIDATION_FAILED", message: "Invalid input", details: issuesOf(err) };
  }
  log.error({ err, tool }, "MCP tool failed");
  return { code: "INTERNAL", message: "Internal server error" };
}

function issuesOf(err: ZodError): unknown[] {
  return err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

function errorResult(e: ToolError): CallToolResult {
  const safe = redactOutput(e) as ToolError;
  return {
    isError: true,
    content: [{ type: "text", text: `${safe.code}: ${safe.message}` }],
    structuredContent: { error: safe },
  };
}

/**
 * One tools/call: scope check → input validation → existing service → redacted result. Every
 * call (allowed, denied, invalid or failed) is audited with actor `mcp_client:<token name>`.
 */
export async function callMcpTool(
  name: string,
  args: Record<string, unknown> | undefined,
  identity: Pick<TokenIdentity, "name" | "scope">,
  deps: McpDeps,
): Promise<CallToolResult> {
  const actor = `mcp_client:${identity.name}`;
  const log = deps.logger ?? defaultLogger;
  const audit = (outcome: "success" | "denied" | "failed", details: Record<string, unknown>) =>
    deps.audit.record({
      actor,
      action: `mcp.${isToolName(name) ? name : "unknown_tool"}`,
      targetType: "mcp_tool",
      targetId: name.slice(0, 256),
      outcome,
      details: { tokenScope: identity.scope, ...details },
    });

  if (!isToolName(name)) {
    audit("failed", { code: "NOT_FOUND" });
    return errorResult({ code: "NOT_FOUND", message: `Unknown tool ${name.slice(0, 80)}` });
  }
  const required = MCP_TOOLS[name];
  if (required === "control" && identity.scope !== "control") {
    audit("denied", { code: "FORBIDDEN", required });
    return errorResult({
      code: "FORBIDDEN",
      message: `${name} requires a control token; this token is read-only`,
    });
  }
  const raw = args ?? {};
  const parsed = MCP_TOOL_INPUTS[name].safeParse(raw);
  if (!parsed.success) {
    audit("failed", { code: "VALIDATION_FAILED" });
    return errorResult({
      code: "VALIDATION_FAILED",
      message: "Invalid input",
      details: issuesOf(parsed.error),
    });
  }
  try {
    // the input was parsed with this tool's own schema just above
    const def = MCP_TOOL_DEFS[name] as ToolDef<McpToolName>;
    const out = await def.run(parsed.data, { actor, services: deps, args: raw });
    audit("success", {});
    return {
      content: [{ type: "text", text: redactString(out.text) }],
      structuredContent: redactOutput(out.structured) as Record<string, unknown>,
    };
  } catch (err) {
    const e = toToolError(err, log, name);
    const denied = e.code === "FORBIDDEN" || e.code === "CAPABILITY_UNSUPPORTED";
    audit(denied ? "denied" : "failed", { code: e.code });
    return errorResult(e);
  }
}

/** A per-request MCP server bound to one verified token identity. */
export function createMcpServer(
  identity: Pick<TokenIdentity, "name" | "scope">,
  deps: McpDeps,
): McpServer {
  const mcp = new McpServer(
    { name: "ubuliera", version: SERVER_VERSION },
    {
      instructions:
        "Ubuliera orchestrates Claude Code sessions. Risky tasks and approvals are decided by a " +
        "human in the Ubuliera dashboard; start_execution never approves them.",
    },
  );
  // low-level handlers so scope, validation and error codes follow the REST contract
  mcp.server.registerCapabilities({ tools: {} });
  const tools = listMcpTools();
  mcp.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools }));
  mcp.server.setRequestHandler(CallToolRequestSchema, (req) =>
    callMcpTool(req.params.name, req.params.arguments, identity, deps),
  );
  return mcp;
}

/**
 * Mount the optional MCP endpoint (US8, FR-043) on the Hono app at `/mcp`: Streamable HTTP,
 * stateless (one server + transport per request, JSON responses). Disabled ⇒ 404; without a
 * valid, unrevoked API token ⇒ 401. Mount before any SPA catch-all.
 */
export function mountMcp(app: Hono<AppBindings>, deps: McpDeps): void {
  const log = deps.logger ?? defaultLogger;
  app.all(MCP_ENDPOINT_PATH, async (c) => {
    if (!deps.settings.mcpEnabled()) {
      throw new AppError("NOT_FOUND", `No route for ${c.req.method} ${c.req.path}`);
    }
    const secret = bearerToken(c.req.header("authorization"));
    const identity = secret ? deps.tokens.verify(secret) : null;
    if (!identity) {
      return c.json(errorBody("UNAUTHENTICATED", "A valid Ubuliera API token is required"), 401, {
        "www-authenticate": 'Bearer realm="ubuliera-mcp"',
      });
    }
    if (c.req.method !== "POST") {
      // stateless server: no standalone SSE stream (GET) and no session to delete (DELETE)
      return c.json(
        {
          jsonrpc: "2.0",
          error: { code: -32000, message: "Method not allowed; POST JSON-RPC messages" },
          id: null,
        },
        405,
        { allow: "POST" },
      );
    }
    const server = createMcpServer(identity, deps);
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
    await server.connect(transport);
    try {
      return await transport.handleRequest(c.req.raw);
    } finally {
      server.close().catch((err: unknown) => log.warn({ err }, "closing an MCP server failed"));
    }
  });
}
