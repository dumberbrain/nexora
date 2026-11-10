/**
 * US8 MCP server (T151): the MCP client SDK over Streamable HTTP against the in-process Hono
 * app, the fake ManagedRuntime and fake worktrees — no network, no real `claude`.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  ExecutionSchema,
  ExecutionTasksSchema,
  MCP_TOOLS,
  McpStartExecutionResultSchema,
  SessionSchema,
} from "@ubuliera/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { mountMcp } from "../../src/mcp/server";
import { SettingsService } from "../../src/modules/permission-manager/settings.service";
import { TokenService } from "../../src/modules/permission-manager/token.service";
import { testEnv } from "../helpers/us1";
import { createUs2Harness, type Us2Harness } from "../helpers/us2";

const MCP_URL = "http://127.0.0.1:3022/mcp";

const RISKY_PROMPT = [
  "1. Add a users endpoint in src/api/users.ts",
  "2. Build the users page in src/web/users.tsx",
  "3. Deploy the result to production",
].join("\n");
const SAFE_PROMPT = "Refactor the logger";

let h: Us2Harness;
let tokens: TokenService;
let settings: SettingsService;
let projectId: string;
let clients: Client[];

beforeEach(async () => {
  h = await createUs2Harness({ sessionRows: true });
  tokens = new TokenService({ db: h.db, audit: h.audit });
  settings = new SettingsService({ db: h.db, audit: h.audit, env: testEnv });
  mountMcp(h.app, {
    orchestration: h.orchestration,
    controls: h.controls,
    sessions: h.services.sessions,
    agents: h.services.agents,
    store: h.store,
    audit: h.audit,
    tokens,
    settings,
    publicUrl: testEnv.publicUrl,
  });
  projectId = (await h.services.projects.register({ rootPath: h.root }, "user")).id;
  clients = [];
});
afterEach(async () => {
  await Promise.all(clients.map((c) => c.close()));
  await h.close();
});

const inProcessFetch = async (url: string | URL, init?: RequestInit): Promise<Response> =>
  await h.app.request(url instanceof URL ? url.href : url, init);

function token(name: string, scope: "read" | "control"): string {
  return tokens.create({ name, scope }, "user").secret;
}

async function connect(secret: string): Promise<Client> {
  const client = new Client({ name: "ubuliera-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { authorization: `Bearer ${secret}` } },
    fetch: inProcessFetch,
  });
  await client.connect(transport);
  clients.push(client);
  return client;
}

const ToolResult = z.object({
  isError: z.boolean().optional(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  structuredContent: z.record(z.string(), z.unknown()).optional(),
});
type ToolResult = z.infer<typeof ToolResult>;

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  return ToolResult.parse(await client.callTool({ name, arguments: args }));
}

function ok(r: ToolResult): Record<string, unknown> {
  expect(r.isError ?? false, JSON.stringify(r.content)).toBe(false);
  expect(r.content[0]?.type).toBe("text");
  expect(r.content[0]?.text?.length).toBeGreaterThan(0);
  return r.structuredContent ?? {};
}

function errorCode(r: ToolResult): string {
  expect(r.isError).toBe(true);
  const err = z
    .object({ error: z.object({ code: z.string(), message: z.string() }) })
    .parse(r.structuredContent);
  expect(r.content[0]?.text).toContain(err.error.code);
  return err.error.code;
}

const rawPost = (headers: Record<string, string> = {}) =>
  h.app.request(MCP_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });

function mcpAudit() {
  return h.audit
    .list({ limit: 500 })
    .items.filter((a) => a.action.startsWith("mcp."))
    .reverse();
}

/** analyze_task → create_execution_plan over MCP; returns the execution id. */
async function planViaMcp(client: Client, prompt: string): Promise<string> {
  const analyzed = ExecutionSchema.parse(
    ok(await call(client, "analyze_task", { projectId, prompt })),
  );
  expect(analyzed.status).toBe("awaiting_mode");
  const plan = ExecutionTasksSchema.parse(
    ok(
      await call(client, "create_execution_plan", {
        executionId: analyzed.id,
        mode: "multi_session",
        strategy: "plan_first",
      }),
    ),
  );
  expect(plan.items.length).toBeGreaterThan(0);
  return analyzed.id;
}

describe("MCP server (US8, T151)", () => {
  it("is disabled by default: /mcp answers 404 even with a valid token", async () => {
    const secret = token("claude-desktop", "control");
    expect(settings.mcpEnabled()).toBe(false);
    expect((await rawPost({ authorization: `Bearer ${secret}` })).status).toBe(404);
    expect((await rawPost()).status).toBe(404);
    await expect(connect(secret)).rejects.toThrow();
  });

  it("unauthenticated, unknown or revoked tokens → 401", async () => {
    settings.setMcpEnabled(true, "user");
    expect((await rawPost()).status).toBe(401);
    expect((await rawPost({ authorization: "Bearer not-a-real-token" })).status).toBe(401);
    expect((await rawPost({ authorization: `Basic ${"x".repeat(40)}` })).status).toBe(401);
    // the remote env token is not an MCP token
    const { secret, token: t } = tokens.create({ name: "soon-gone", scope: "read" }, "user");
    expect((await rawPost({ authorization: `Bearer ${secret}` })).status).toBe(200);
    tokens.revoke(t.id, "user");
    expect((await rawPost({ authorization: `Bearer ${secret}` })).status).toBe(401);
    await expect(connect(secret)).rejects.toThrow();
  });

  it("disabling MCP again closes the endpoint immediately", async () => {
    settings.setMcpEnabled(true, "user");
    const secret = token("toggler", "read");
    expect((await rawPost({ authorization: `Bearer ${secret}` })).status).toBe(200);
    settings.setMcpEnabled(false, "user");
    expect((await rawPost({ authorization: `Bearer ${secret}` })).status).toBe(404);
  });

  it("lists exactly the contract tools with JSON Schema inputs (no approval tools)", async () => {
    settings.setMcpEnabled(true, "user");
    const client = await connect(token("lister", "read"));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(Object.keys(MCP_TOOLS).sort());
    expect(tools.some((t) => /approv|decide/i.test(t.name))).toBe(false);
    for (const t of tools) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.description).toBeTruthy();
    }
    const analyze = tools.find((t) => t.name === "analyze_task");
    expect(analyze?.inputSchema.required).toEqual(expect.arrayContaining(["projectId", "prompt"]));
    const logs = tools.find((t) => t.name === "get_execution_logs");
    expect(logs?.inputSchema.required ?? []).not.toContain("limit");
  });

  it("a read token cannot call control tools (FORBIDDEN, audited as denied)", async () => {
    settings.setMcpEnabled(true, "user");
    const reader = await connect(token("reader", "read"));
    // analyze_task is a read tool (it only creates a draft execution)
    const executionId = ExecutionSchema.parse(
      ok(await call(reader, "analyze_task", { projectId, prompt: SAFE_PROMPT })),
    ).id;

    for (const name of Object.keys(MCP_TOOLS).filter(
      (n) => MCP_TOOLS[n as keyof typeof MCP_TOOLS] === "control",
    )) {
      const args =
        name === "send_agent_message"
          ? { agentId: "a-1", text: "hi" }
          : name === "create_execution_plan"
            ? { executionId, mode: "multi_session", strategy: "plan_first" }
            : { executionId };
      expect(errorCode(await call(reader, name, args))).toBe("FORBIDDEN");
    }
    expect(h.orchestration.orchestrator.get(executionId).status).toBe("awaiting_mode");
    const denied = mcpAudit().filter((a) => a.outcome === "denied");
    expect(denied).toHaveLength(6);
    expect(denied.every((a) => a.actor === "mcp_client:reader")).toBe(true);
    // read tools still work
    expect(ok(await call(reader, "get_execution_status", { executionId }))).toMatchObject({
      execution: { id: executionId },
    });
  });

  it("invalid input → isError with VALIDATION_FAILED (audited)", async () => {
    settings.setMcpEnabled(true, "user");
    const client = await connect(token("validator", "control"));
    expect(errorCode(await call(client, "list_tasks", { executionId: "nope" }))).toBe(
      "VALIDATION_FAILED",
    );
    expect(errorCode(await call(client, "analyze_task", { projectId }))).toBe("VALIDATION_FAILED");
    expect(
      errorCode(
        await call(client, "send_agent_message", { agentId: "a-1", text: "x".repeat(8001) }),
      ),
    ).toBe("VALIDATION_FAILED");
    expect(
      errorCode(
        await call(client, "get_execution_logs", {
          executionId: "01JAAAAAAAAAAAAAAAAAAAAAAA",
          limit: 500,
        }),
      ),
    ).toBe("VALIDATION_FAILED");
    // service errors keep their REST code
    expect(
      errorCode(
        await call(client, "get_execution_status", { executionId: "01JAAAAAAAAAAAAAAAAAAAAAAA" }),
      ),
    ).toBe("NOT_FOUND");
    expect(errorCode(await call(client, "no_such_tool", {}))).toBe("NOT_FOUND");
    const failed = mcpAudit().filter((a) => a.outcome === "failed");
    expect(failed).toHaveLength(6);
    expect(failed.every((a) => a.actor === "mcp_client:validator")).toBe(true);
  });

  it("start_execution never approves risky tasks → approval_required + dashboard link", async () => {
    settings.setMcpEnabled(true, "user");
    const client = await connect(token("driver", "control"));
    const id = await planViaMcp(client, RISKY_PROMPT);
    const risky = h.orchestration.tasks.list(id).filter((t) => t.riskClass !== "normal");
    expect(risky.length).toBeGreaterThan(0);

    const result = McpStartExecutionResultSchema.parse(
      ok(await call(client, "start_execution", { executionId: id })),
    );
    expect(result.status).toBe("approval_required");
    expect(result.executionId).toBe(id);
    expect(result.pendingApprovalTaskIds.sort()).toEqual(risky.map((t) => t.id).sort());
    expect(result.dashboardUrl).toBe(`${testEnv.publicUrl}/executions/${id}`);

    // nothing risky was approved: the approvals stay pending for a human
    const pending = h.orchestration.approvals.list("pending", id);
    expect(pending.map((a) => a.taskId).sort()).toEqual(risky.map((t) => t.id).sort());
    expect(h.orchestration.approvals.list("approved", id)).toEqual([]);
    const approve = h.audit
      .list({ limit: 200 })
      .items.find((a) => a.action === "execution.approve");
    expect(approve).toMatchObject({
      actor: "mcp_client:driver",
      details: { approveRiskyTaskIds: [], permissionBypass: false },
    });
    // the non-risky tasks run
    await vi.waitFor(() => expect(h.runtime.sessions.length).toBeGreaterThan(0));
    for (const s of h.runtime.sessions) {
      expect(risky.some((t) => s.input.prompt.includes(t.id))).toBe(false);
    }
  });

  it("start_execution without risky tasks → started", async () => {
    settings.setMcpEnabled(true, "user");
    const client = await connect(token("starter", "control"));
    const id = await planViaMcp(client, SAFE_PROMPT);
    const result = McpStartExecutionResultSchema.parse(
      ok(await call(client, "start_execution", { executionId: id })),
    );
    expect(result).toMatchObject({ status: "started", pendingApprovalTaskIds: [] });
    await vi.waitFor(() => expect(h.runtime.sessions).toHaveLength(1));
  });

  it("list_sessions, list_agents, list_tasks, get_execution_status and logs work for read tokens", async () => {
    settings.setMcpEnabled(true, "user");
    const driver = await connect(token("driver", "control"));
    const id = await planViaMcp(driver, SAFE_PROMPT);
    ok(await call(driver, "start_execution", { executionId: id }));
    await vi.waitFor(() => expect(h.runtime.sessions).toHaveLength(1));
    const sessionId = h.runtime.sessions[0]?.id ?? "";
    await vi.waitFor(() => expect(h.services.sessions.get(sessionId)).toBeDefined());

    const reader = await connect(token("observer", "read"));
    const sessions = z
      .object({ items: z.array(SessionSchema) })
      .parse(ok(await call(reader, "list_sessions", { executionId: id })));
    expect(sessions.items.map((s) => s.id)).toEqual([sessionId]);
    expect(
      z
        .object({ items: z.array(SessionSchema) })
        .parse(ok(await call(reader, "list_sessions", { status: "failed" }))).items,
    ).toEqual([]);

    const agents = z
      .object({ items: z.array(z.object({ id: z.string() })) })
      .parse(ok(await call(reader, "list_agents", { executionId: id })));
    expect(Array.isArray(agents.items)).toBe(true);

    const tasks = ExecutionTasksSchema.parse(
      ok(await call(reader, "list_tasks", { executionId: id })),
    );
    expect(tasks.items).toHaveLength(1);
    expect(
      ExecutionTasksSchema.parse(
        ok(await call(reader, "list_tasks", { executionId: id, status: "completed" })),
      ).items,
    ).toEqual([]);

    expect(ok(await call(reader, "get_execution_status", { executionId: id }))).toMatchObject({
      execution: { id, status: "running" },
      tasks: { total: 1 },
    });
    expect(ok(await call(reader, "recommend_execution_mode", { executionId: id }))).toHaveProperty(
      "items",
    );

    h.store.append({
      type: "error",
      source: "orchestrator",
      reliability: "authoritative",
      severity: "error",
      executionId: id,
      summary: "boom with Bearer abcdefghijklmnop0123456789 inside",
      payload: { apiKey: "sk-ant-abcdefghijklmnopqrstuvwxyz" },
    });
    h.store.flush();
    const logs = ok(
      await call(reader, "get_execution_logs", { executionId: id, severity: "error" }),
    );
    const text = JSON.stringify(logs);
    expect(text).toContain("boom with Bearer [REDACTED]");
    expect(text).not.toContain("abcdefghijklmnop0123456789");
    expect(text).not.toContain("sk-ant-abcdefghijklmnopqrstuvwxyz");
  });

  it("control tools reach the existing services (stop_execution, send_agent_message errors)", async () => {
    settings.setMcpEnabled(true, "user");
    const client = await connect(token("controller", "control"));
    const id = await planViaMcp(client, SAFE_PROMPT);
    ok(await call(client, "start_execution", { executionId: id }));
    await vi.waitFor(() => expect(h.runtime.sessions).toHaveLength(1));
    expect(errorCode(await call(client, "resume_execution", { executionId: id }))).toBe("CONFLICT");
    expect(errorCode(await call(client, "send_agent_message", { agentId: "x", text: "hi" }))).toBe(
      "NOT_FOUND",
    );
    expect(
      ExecutionSchema.parse(ok(await call(client, "stop_execution", { executionId: id }))).status,
    ).toBe("cancelled");
    const stop = h.audit.list({ limit: 200 }).items.find((a) => a.action === "execution.stop");
    expect(stop?.actor).toBe("mcp_client:controller");
  });

  it("every tool call is audited with actor mcp_client:<token name>", async () => {
    settings.setMcpEnabled(true, "user");
    const client = await connect(token("auditor", "control"));
    const before = mcpAudit().length;
    const id = await planViaMcp(client, SAFE_PROMPT);
    await call(client, "get_execution_status", { executionId: id });
    await call(client, "list_sessions", {});
    await call(client, "list_tasks", { executionId: "bad" });
    const entries = mcpAudit().slice(before);
    expect(entries.map((a) => a.action)).toEqual([
      "mcp.analyze_task",
      "mcp.create_execution_plan",
      "mcp.get_execution_status",
      "mcp.list_sessions",
      "mcp.list_tasks",
    ]);
    expect(entries.every((a) => a.actor === "mcp_client:auditor")).toBe(true);
    expect(entries.map((a) => a.outcome)).toEqual([
      "success",
      "success",
      "success",
      "success",
      "failed",
    ]);
    expect(entries.every((a) => a.targetType === "mcp_tool")).toBe(true);
  });
});
