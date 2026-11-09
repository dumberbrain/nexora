import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { z } from "zod";

import { redactString } from "../../lib/redactor";

/**
 * MCP server discovery (T088): project `.mcp.json`, user `~/.claude.json` (global and the
 * per-project block). Env values and headers are never returned — only their counts — and every
 * argument/url goes through the redactor (FR-052).
 */
export interface DiscoveredMcpServer {
  name: string;
  scope: "project" | "user";
  transport: "stdio" | "http" | "sse";
  command: string | null;
  args: string[];
  url: string | null;
  envKeyCount: number;
  headerKeyCount: number;
  /** env / header key NAMES (never values) — only with `{ keyNames: true }` */
  envKeys?: string[];
  headerKeys?: string[];
  sourcePath: string;
}

export interface McpDiscoveryOptions {
  /** also return env/header key names (values are never read into the result) */
  keyNames?: boolean;
}

const MAX_FILE_BYTES = 4 * 1024 * 1024;

const ServerSchema = z.looseObject({
  type: z.string().optional(),
  command: z.string().optional(),
  args: z.array(z.unknown()).optional(),
  url: z.string().optional(),
  env: z.record(z.string(), z.unknown()).optional(),
  headers: z.record(z.string(), z.unknown()).optional(),
});
const ServersSchema = z.record(z.string(), z.unknown());
const FileSchema = z.looseObject({
  mcpServers: ServersSchema.optional(),
  projects: z
    .record(z.string(), z.looseObject({ mcpServers: ServersSchema.optional() }))
    .optional(),
});

async function readJson(path: string): Promise<z.infer<typeof FileSchema> | null> {
  try {
    const s = await stat(path);
    if (!s.isFile() || s.size > MAX_FILE_BYTES) return null;
    const parsed = FileSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function transportOf(s: z.infer<typeof ServerSchema>): DiscoveredMcpServer["transport"] {
  if (s.type === "http" || s.type === "streamable-http") return "http";
  if (s.type === "sse") return "sse";
  if (s.type === "stdio" || s.command) return "stdio";
  return s.url ? "http" : "stdio";
}

function toServers(
  raw: Record<string, unknown> | undefined,
  scope: DiscoveredMcpServer["scope"],
  sourcePath: string,
  opts: McpDiscoveryOptions,
): DiscoveredMcpServer[] {
  const out: DiscoveredMcpServer[] = [];
  for (const [name, value] of Object.entries(raw ?? {})) {
    const parsed = ServerSchema.safeParse(value);
    if (!parsed.success || name.length === 0) continue;
    const s = parsed.data;
    out.push({
      name: name.slice(0, 200),
      scope,
      transport: transportOf(s),
      command: s.command ? redactString(s.command) : null,
      args: (s.args ?? []).filter((a): a is string => typeof a === "string").map(redactString),
      url: s.url ? redactString(s.url) : null,
      envKeyCount: Object.keys(s.env ?? {}).length,
      headerKeyCount: Object.keys(s.headers ?? {}).length,
      ...(opts.keyNames
        ? {
            envKeys: Object.keys(s.env ?? {}).map(redactString),
            headerKeys: Object.keys(s.headers ?? {}).map(redactString),
          }
        : {}),
      sourcePath,
    });
  }
  return out;
}

/** Paths in ~/.claude.json `projects` are stored with either slash style. */
function samePath(a: string, b: string): boolean {
  const n = (p: string) => {
    const r = resolve(p).replace(/\\/g, "/").replace(/\/+$/, "");
    return process.platform === "win32" ? r.toLowerCase() : r;
  };
  return n(a) === n(b);
}

export async function discoverMcpServers(
  /** `projectRoot: null` → user-level servers only (no project file, no per-project block) */
  roots: { projectRoot: string | null; homeDir: string },
  opts: McpDiscoveryOptions = {},
): Promise<DiscoveredMcpServer[]> {
  const { projectRoot } = roots;
  const userFile = join(roots.homeDir, ".claude.json");
  const user = await readJson(userFile);
  if (projectRoot === null) return toServers(user?.mcpServers, "user", userFile, opts);
  const projectFile = join(projectRoot, ".mcp.json");
  const project = await readJson(projectFile);
  const local = Object.entries(user?.projects ?? {}).find(([p]) => samePath(p, projectRoot));
  return [
    ...toServers(project?.mcpServers, "project", projectFile, opts),
    ...toServers(user?.mcpServers, "user", userFile, opts),
    ...toServers(local?.[1].mcpServers, "user", userFile, opts),
  ];
}
