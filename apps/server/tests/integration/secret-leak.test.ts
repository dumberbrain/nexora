/**
 * SC-004 / FR-052 (T160): known secret patterns seeded through every way data enters Ubuliera —
 * Claude Code hook ingest, recorded Agent SDK stream messages and MCP server configs (env,
 * headers, URL credentials) — must never come back out: not in any DB row (nor in the raw DB
 * files), not over the /live socket, not in exports, not in REST or MCP responses.
 *
 * Runs the real server (fake runtime, temp data dir, temp HOME) on a random loopback port.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { HOOK_TOKEN_HEADER } from "@ubuliera/contracts";
import { io as ioc, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { type UbulieraEnv } from "../../src/config/env";
import { createLogger } from "../../src/lib/logger";
import { REDACTED } from "../../src/lib/redactor";
import { type EventInput } from "../../src/modules/event-manager";
import { MessageMapper } from "../../src/modules/runtime-manager/adapters/agent-sdk/message-mapper";
import { createUbulieraServer, type UbulieraServer } from "../../src/server";

// Fake credentials assembled at runtime so secret scanners don't flag this file.
const fake = (...parts: string[]) => parts.join("");

/** Every value here must stay inside the test. */
const S = {
  anthropic: fake("sk-ant-", "api03-Zq9XyW8vU7tS6rQ5pO4nM3lK2jI1hG0f"),
  github: fake("ghp_", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"),
  githubPat: fake("github_pat_", "11ABCDEFG0123456789_abcdefghijklmnop"),
  awsKeyId: fake("AKIA", "Z7X6W5V4U3T2S1R0"),
  awsSecret: fake("wJalrXUtnFEMI/K7MDENG/", "bPxRfiCY", "LEAKTESTKY"),
  bearer: "mF_9.B5f-4.1JqM-opaqueBearerValue77",
  password: "Tr0ub4dor-and-3-horses",
  jwt: fake("eyJhbGciOiJIUzI1NiJ9", ".eyJzdWIiOiJsZWFrLXRlc3QifQ", ".c2lnbmF0dXJlLXZhbHVlLTEyMzQ"),
  // MCP config only: these are never read into any result at all
  mcpEnv: "pg-env-s3cr3t-Value-42",
  mcpHeader: "mcp-header-token-XYZ123456",
  mcpApiKey: "mcp-x-api-key-9f8e7d6c5b4a",
  mcpUrlPassword: "UrlPassw0rd-777",
};
const SECRETS = Object.entries(S);

const SESSION = "5f3c0b5e-1c1a-4d8e-9f00-5ec2e7a1eaf0";
const SDK_SESSION = "06109064-d9fe-49a8-9df1-ddcb12bca712";
const port = 40_000 + Math.floor(Math.random() * 10_000);

let base: string;
let root: string;
let server: UbulieraServer;
let cookie: string;
let csrf: string;
let socket: Socket;
const received: unknown[] = [];
/** every response body the outside world could see */
const outputs: { where: string; text: string }[] = [];

function expectNoSecrets(where: string, text: string): void {
  for (const [name, value] of SECRETS) {
    expect(text.includes(value), `${name} leaked via ${where}`).toBe(false);
  }
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${server.url}/api/v1${path}`, {
    ...init,
    headers: {
      cookie,
      "x-ubuliera-csrf": csrf,
      "content-type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

async function capture(where: string, res: Response): Promise<string> {
  const text = await res.text();
  expect(res.status, `${where}: ${text}`).toBeLessThan(300);
  outputs.push({ where, text });
  return text;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

/** Recorded SDK stream (spike S3) with secrets injected into a tool call, its result and text. */
function sdkMessages(): Record<string, unknown>[] {
  const swap = (v: unknown): unknown => {
    if (typeof v === "string") {
      if (v.startsWith("Set-Content -Path a.txt")) {
        return `$env:GH_TOKEN="${S.github}"; aws configure set aws_secret_access_key ${S.awsSecret}`;
      }
      if (v === "one") return `ANTHROPIC_API_KEY=${S.anthropic}\nAWS_ACCESS_KEY_ID=${S.awsKeyId}`;
      if (v === "OK") return `Done. I used the token ${S.githubPat} and Bearer ${S.bearer}.`;
      return v;
    }
    if (Array.isArray(v)) return v.map(swap);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)]));
    }
    return v;
  };
  return readFileSync(join(import.meta.dirname, "..", "fixtures", "sdk", "phase1.jsonl"), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => swap(JSON.parse(l)) as Record<string, unknown>)
    .filter((m) => typeof m.type === "string");
}

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), "ubuliera-leak-"));
  root = join(base, "repo");
  const home = join(base, "home");
  mkdirSync(home, { recursive: true });
  // discovery reads ~/.claude*.json — keep it inside the test
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);

  writeJson(join(root, "package.json"), { name: "leak-demo", devDependencies: { vitest: "4" } });
  writeJson(join(root, ".mcp.json"), {
    mcpServers: {
      postgres: {
        command: "npx",
        args: ["pg-mcp", `postgres://admin:${S.mcpUrlPassword}@db/app`, `--token=${S.github}`],
        env: { PGPASSWORD: S.mcpEnv, GITHUB_TOKEN: S.github },
      },
      remote: {
        type: "http",
        url: `https://mcp.example.test/mcp?api_key=${S.anthropic}`,
        headers: { Authorization: `Bearer ${S.mcpHeader}`, "X-Api-Key": S.mcpApiKey },
      },
    },
  });
  writeJson(join(home, ".claude.json"), {
    mcpServers: { userwide: { command: "uvx", args: ["x"], env: { OPENAI_KEY: S.mcpApiKey } } },
  });

  const env: UbulieraEnv = {
    nodeEnv: "test",
    host: "127.0.0.1",
    port,
    remote: false,
    token: undefined,
    dataDir: join(base, "data"),
    publicUrl: `http://127.0.0.1:${port}`,
    testFakeRuntime: true,
    retentionDays: 30,
  };
  server = await createUbulieraServer({
    env,
    webDistDir: null,
    logger: createLogger({ level: "silent" }),
  });

  const auth = await fetch(`${server.url}/api/v1/auth/session`);
  cookie = auth.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  csrf = /ubuliera_csrf=([^;]+)/.exec(cookie)?.[1] ?? "";

  socket = ioc(`${server.url}/live`, {
    transports: ["websocket"],
    extraHeaders: { cookie },
    reconnection: false,
  });
  socket.onAny((name: string, ...args: unknown[]) => received.push({ name, args }));
  await new Promise<void>((resolve, reject) => {
    socket.on("connect", () => resolve());
    socket.on("connect_error", reject);
  });
  await new Promise((resolve) => socket.emit("subscribe", { scope: "global" }, resolve));
});

afterAll(async () => {
  socket?.disconnect();
  await server?.close();
  vi.unstubAllEnvs();
  rmSync(base, { recursive: true, force: true });
});

describe("secret leak (SC-004)", () => {
  let projectId: string;
  let executionId: string;
  let mcp: Client;

  it("ingests hook deliveries that carry secrets", async () => {
    const project = JSON.parse(
      await capture(
        "POST /projects",
        await api("/projects", { method: "POST", body: JSON.stringify({ rootPath: root }) }),
      ),
    ) as { id: string };
    projectId = project.id;
    await capture(
      "POST /hooks/install",
      await api(`/projects/${projectId}/hooks/install`, {
        method: "POST",
        body: JSON.stringify({ confirm: true }),
      }),
    );
    const settings = JSON.parse(
      readFileSync(join(root, ".claude", "settings.local.json"), "utf8"),
    ) as { hooks: Record<string, { hooks: { headers: Record<string, string> }[] }[]> };
    const hookToken = settings.hooks.Stop?.[0]?.hooks[0]?.headers[HOOK_TOKEN_HEADER] ?? "";
    expect(hookToken).not.toBe("");

    const common = { session_id: SESSION, cwd: root, permission_mode: "default" };
    const deliveries: Record<string, unknown>[] = [
      {
        ...common,
        hook_event_name: "UserPromptSubmit",
        prompt: `Deploy with ANTHROPIC_API_KEY=${S.anthropic} and push using ${S.github}`,
      },
      {
        ...common,
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_use_id: "toolu_leak_1",
        tool_input: {
          command:
            `curl -H "Authorization: Bearer ${S.bearer}" https://api.example.test && ` +
            `export AWS_ACCESS_KEY_ID=${S.awsKeyId} aws_secret_access_key=${S.awsSecret} ` +
            `DB_PASSWORD=${S.password}`,
          env: { API_TOKEN: S.githubPat, password: S.password },
          headers: { Authorization: `Bearer ${S.jwt}` },
        },
      },
      {
        ...common,
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_use_id: "toolu_leak_1",
        tool_input: { command: `echo ${S.anthropic}` },
        tool_response: {
          stdout: `GITHUB_TOKEN=${S.github}\nPASSWORD=${S.password}\nJWT ${S.jwt}\n`,
          stderr: `warning: password=${S.password} is weak`,
        },
      },
      {
        ...common,
        hook_event_name: "SubagentStop",
        agent_id: "agent-leak",
        agent_type: "general-purpose",
        last_assistant_message: `Used ${S.anthropic} and ${S.awsKeyId} to finish.`,
      },
      { ...common, hook_event_name: "Stop", last_assistant_message: `token: ${S.githubPat}` },
    ];
    for (const body of deliveries) {
      const res = await fetch(`${server.url}/api/v1/hooks/ingest`, {
        method: "POST",
        headers: { "content-type": "application/json", [HOOK_TOKEN_HEADER]: hookToken },
        body: JSON.stringify(body),
      });
      expect(res.status, String(body.hook_event_name)).toBeLessThan(300);
      outputs.push({ where: `hook ${String(body.hook_event_name)}`, text: await res.text() });
    }
  });

  it("analyzes over MCP (reads the secret-laden MCP configs) and records SDK stream events", async () => {
    const created = JSON.parse(
      await capture(
        "POST /tokens",
        await api("/tokens", {
          method: "POST",
          body: JSON.stringify({ name: "leak-test", scope: "read" }),
        }),
      ),
    ) as { secret: string };
    await capture(
      "PUT /settings/mcp",
      await api("/settings/mcp", { method: "PUT", body: JSON.stringify({ enabled: true }) }),
    );
    // the token's own secret is shown once by design; drop that response from the haystack
    outputs.pop();

    mcp = new Client({ name: "leak-test", version: "1.0.0" });
    await mcp.connect(
      new StreamableHTTPClientTransport(new URL(`${server.url}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${created.secret}` } },
      }),
    );
    const analyzed = (await mcp.callTool({
      name: "analyze_task",
      arguments: { projectId, prompt: "Add a health endpoint" },
    })) as { structuredContent?: { id?: string }; isError?: boolean };
    expect(analyzed.isError ?? false, JSON.stringify(analyzed)).toBe(false);
    outputs.push({ where: "mcp analyze_task", text: JSON.stringify(analyzed) });
    executionId = analyzed.structuredContent?.id ?? "";
    expect(executionId).not.toBe("");

    // the Agent SDK adapter's mapper → EventStore, exactly as RuntimeManager's sink does it
    const mapper = new MessageMapper(
      { executionId, taskId: null, source: "agent_sdk" },
      { emit: (e: EventInput) => server.store.append(e) },
    );
    for (const m of sdkMessages()) mapper.map(m);
    server.store.flush();
    expect(server.store.list({ sessionId: SDK_SESSION, limit: 50 }).items.length).toBeGreaterThan(
      0,
    );
  });

  it("returns no secret from MCP tools", async () => {
    for (const [name, args] of [
      ["list_sessions", {}],
      ["get_execution_status", { executionId }],
      ["get_execution_logs", { executionId, limit: 100 }],
      ["recommend_execution_mode", { executionId }],
    ] as const) {
      const r = await mcp.callTool({ name, arguments: args });
      expect((r as { isError?: boolean }).isError ?? false, `${name}: ${JSON.stringify(r)}`).toBe(
        false,
      );
      outputs.push({ where: `mcp ${name}`, text: JSON.stringify(r) });
    }
    const logs = outputs.find((o) => o.where === "mcp get_execution_logs")?.text ?? "";
    expect(logs).toContain(REDACTED);
    await mcp.close();
  });

  it("returns no secret from REST reads and exports", async () => {
    for (const path of [
      "/events?limit=200",
      `/events?q=${encodeURIComponent("token")}&limit=200`,
      "/events/export?format=jsonl",
      "/events/export?format=csv",
      "/sessions",
      `/sessions/${SESSION}`,
      "/agents?limit=200",
      `/integrations?projectId=${projectId}`,
      `/integrations?projectId=${projectId}&type=mcp_server`,
      `/executions/${executionId}`,
      "/audit?limit=200",
    ]) {
      const res = await api(path);
      if (res.status === 404 && path.startsWith("/audit")) continue;
      await capture(`GET ${path}`, res);
    }
    const ndjson = outputs.find((o) => o.where.includes("format=jsonl"))?.text ?? "";
    expect(ndjson).toContain(REDACTED);
    expect(ndjson).toContain(SESSION);
    const mcpInventory = outputs.find((o) => o.where.startsWith("GET /integrations"))?.text ?? "";
    expect(mcpInventory).toContain("postgres");
  });

  it("replays history over the socket without secrets", async () => {
    await new Promise((resolve) =>
      socket.emit(
        "subscribe",
        { scope: "session", id: SESSION, sinceEventId: "00000000000000000000000000" },
        resolve,
      ),
    );
    await new Promise((r) => setTimeout(r, 200));
    const text = JSON.stringify(received);
    expect(text).toContain(SESSION);
    expect(text).toContain(REDACTED);
    outputs.push({ where: "socket /live", text });
  });

  it("leaks nothing anywhere", () => {
    for (const o of outputs) expectNoSecrets(o.where, o.text);
  });

  it("stores no secret in any DB row", () => {
    server.store.flush();
    const sqlite = server.db.$client;
    const tables = sqlite.prepare("select name from sqlite_master where type = 'table'").all() as {
      name: string;
    }[];
    expect(tables.map((t) => t.name)).toEqual(expect.arrayContaining(["events", "sessions"]));
    let rows = 0;
    for (const { name } of tables) {
      for (const row of sqlite.prepare(`select * from "${name}"`).all() as object[]) {
        rows++;
        const text = Object.values(row)
          .map((v) => (Buffer.isBuffer(v) ? v.toString("latin1") : String(v)))
          .join("\u0000");
        expectNoSecrets(`table ${name}`, text);
      }
    }
    expect(rows).toBeGreaterThan(10);
  });

  it("writes no secret to the database files on disk", async () => {
    await server.close();
    const dir = join(base, "data");
    for (const f of readdirSync(dir, { recursive: true, withFileTypes: true })) {
      if (!f.isFile()) continue;
      const bytes = readFileSync(join(f.parentPath, f.name)).toString("latin1");
      expectNoSecrets(`file ${f.name}`, bytes);
    }
  });
});
