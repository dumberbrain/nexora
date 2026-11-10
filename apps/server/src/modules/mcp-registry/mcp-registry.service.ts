import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { type Integration, type IntegrationItem } from "@ubuliera/contracts";
import { z } from "zod";

import { type DiscoveredMcpServer, discoverMcpServers } from "./discovery";
import { redact, REDACTED } from "../../lib/redactor";
import { newId } from "../../lib/ulid";

/*
 * MCP server inventory (T146, FR-052): discovery + permission status + health. Env and header
 * VALUES never enter an item (only key names / counts), args are reduced to a count, and every
 * item passes the redactor. stdio servers are never spawned — the process allowlist only permits
 * `claude`, `git` and `gh` — so their health is `unknown`.
 */

export type PermissionStatus = Integration["permissionStatus"];
export type Health = Integration["health"];

/* ---------- permission rules (settings permissions.allow/deny/ask) ---------- */

export interface PermissionRules {
  allow: string[];
  deny: string[];
  ask: string[];
  defaultMode: string | null;
}

const MAX_SETTINGS_BYTES = 1024 * 1024;

const SettingsSchema = z.looseObject({
  permissions: z
    .looseObject({
      allow: z.unknown().optional(),
      deny: z.unknown().optional(),
      ask: z.unknown().optional(),
      defaultMode: z.unknown().optional(),
    })
    .optional(),
});
const RuleListSchema = z.array(z.string());

async function readJsonFile(path: string): Promise<unknown> {
  try {
    const s = await stat(path);
    if (!s.isFile() || s.size > MAX_SETTINGS_BYTES) return null;
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

/** Settings files in precedence order (later wins for scalars; rule lists are merged). */
export function settingsFiles(roots: { projectRoot: string | null; homeDir: string }): string[] {
  return [
    join(roots.homeDir, ".claude", "settings.json"),
    ...(roots.projectRoot
      ? [
          join(roots.projectRoot, ".claude", "settings.json"),
          join(roots.projectRoot, ".claude", "settings.local.json"),
        ]
      : []),
  ];
}

/** Merge user, project and local `permissions`; malformed files / fields are ignored. */
export async function loadPermissionRules(roots: {
  projectRoot: string | null;
  homeDir: string;
}): Promise<PermissionRules> {
  const merged: PermissionRules = { allow: [], deny: [], ask: [], defaultMode: null };
  for (const file of settingsFiles(roots)) {
    const parsed = SettingsSchema.safeParse(await readJsonFile(file));
    const perms = parsed.success ? parsed.data.permissions : undefined;
    if (!perms) continue;
    for (const key of ["allow", "deny", "ask"] as const) {
      const list = RuleListSchema.safeParse(perms[key]);
      if (list.success) merged[key].push(...list.data.map((r) => r.trim()).filter(Boolean));
    }
    if (typeof perms.defaultMode === "string") merged.defaultMode = perms.defaultMode;
  }
  for (const key of ["allow", "deny", "ask"] as const) merged[key] = [...new Set(merged[key])];
  return merged;
}

/** deny > ask > allow; nothing matching → Claude Code asks (unless bypassPermissions). */
export function decide(
  rules: PermissionRules,
  matches: (rule: string) => boolean,
): PermissionStatus {
  if (rules.deny.some(matches)) return "denied";
  if (rules.ask.some(matches)) return "ask";
  if (rules.allow.some(matches)) return "allowed";
  return rules.defaultMode === "bypassPermissions" ? "allowed" : "ask";
}

const serverRule = (server: string) => (rule: string) =>
  rule === `mcp__${server}` || rule === `mcp__${server}__*`;

export function mcpServerPermission(rules: PermissionRules, server: string): PermissionStatus {
  return decide(rules, serverRule(server));
}

export function mcpToolPermission(
  rules: PermissionRules,
  server: string,
  tool: string,
): PermissionStatus {
  const onServer = serverRule(server);
  return decide(rules, (rule) => onServer(rule) || rule === `mcp__${server}__${tool}`);
}

/* ---------- health ---------- */

export interface ProbeResult {
  health: Health;
  detail: string | null;
  /** HTTP status when a response arrived */
  status: number | null;
}
export type HealthProbe = (url: string) => Promise<ProbeResult>;

export const PROBE_TIMEOUT_MS = 5_000;

/**
 * Reachability check: HEAD (GET when HEAD is not supported), 5 s timeout, no credentials, no
 * redirects followed. Any HTTP answer below 500 means the endpoint is up (MCP endpoints commonly
 * answer 401/405 to a bare request).
 */
export const fetchProbe: HealthProbe = async (url) => {
  const attempt = async (method: "HEAD" | "GET") => {
    const res = await fetch(url, {
      method,
      redirect: "manual",
      credentials: "omit",
      headers: { accept: "application/json, text/event-stream" },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    await res.body?.cancel().catch(() => undefined);
    return res.status;
  };
  try {
    let status = await attempt("HEAD");
    if (status === 405 || status === 501) status = await attempt("GET");
    return status >= 500
      ? { health: "down", detail: `HTTP ${status}`, status }
      : { health: "ok", detail: null, status };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return {
      health: "down",
      detail: timedOut ? `timed out after ${PROBE_TIMEOUT_MS / 1000} s` : "unreachable",
      status: null,
    };
  }
};

/* ---------- inventory ---------- */

export interface McpRegistryDeps {
  homeDir?: string;
  probe?: HealthProbe;
  now?: () => number;
}

export interface InventoryInput {
  /** project root, or null for user-level servers only */
  projectRoot: string | null;
  projectId?: string | null;
}

async function healthOf(
  s: DiscoveredMcpServer,
  probe: HealthProbe,
  now: number,
): Promise<{ health: Health; healthDetail: string | null; checkedAt: number | null }> {
  if (s.transport === "stdio") {
    return {
      health: "unknown",
      healthDetail:
        "stdio server not checked: Ubuliera never spawns MCP server processes (process allowlist)",
      checkedAt: null,
    };
  }
  if (!s.url) return { health: "unknown", healthDetail: "no url configured", checkedAt: null };
  if (s.url.includes(REDACTED)) {
    return {
      health: "unknown",
      healthDetail: "url contains credentials (redacted); not checked so they are never sent",
      checkedAt: null,
    };
  }
  let parsed: URL;
  try {
    parsed = new URL(s.url);
  } catch {
    return { health: "unknown", healthDetail: "invalid url", checkedAt: null };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { health: "unknown", healthDetail: "unsupported url scheme", checkedAt: null };
  }
  if (parsed.username || parsed.password) {
    return {
      health: "unknown",
      healthDetail: "url contains credentials; not checked so they are never sent",
      checkedAt: null,
    };
  }
  const r = await probe(parsed.toString());
  return { health: r.health, healthDetail: r.detail, checkedAt: now };
}

export class McpRegistryService {
  private readonly homeDir: string;
  private readonly probe: HealthProbe;
  private readonly now: () => number;

  constructor(deps: McpRegistryDeps = {}) {
    this.homeDir = deps.homeDir ?? homedir();
    this.probe = deps.probe ?? fetchProbe;
    this.now = deps.now ?? Date.now;
  }

  async inventory(input: InventoryInput): Promise<IntegrationItem[]> {
    const roots = { projectRoot: input.projectRoot, homeDir: this.homeDir };
    const [servers, rules] = await Promise.all([
      discoverMcpServers(roots, { keyNames: true }),
      loadPermissionRules(roots),
    ]);
    const now = this.now();
    const seen = new Set<string>();
    const unique = servers.filter((s) => {
      const key = `${s.scope}:${s.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return Promise.all(
      unique.map(async (s): Promise<IntegrationItem> => {
        const health = await healthOf(s, this.probe, now);
        const item: IntegrationItem = {
          id: newId(now),
          projectId: s.scope === "project" ? (input.projectId ?? null) : null,
          kind: "mcp_server",
          name: s.name,
          scope: s.scope,
          sourcePath: s.sourcePath,
          executable: false,
          health: health.health,
          permissionStatus: mcpServerPermission(rules, s.name),
          metadata: {
            transport: s.transport,
            command: s.command,
            argCount: s.args.length,
            url: s.url,
            envKeys: s.envKeys ?? [],
            envKeyCount: s.envKeyCount,
            headerKeys: s.headerKeys ?? [],
            headerKeyCount: s.headerKeyCount,
          },
          discoveredAt: now,
          description: null,
          // tools need an MCP session (initialize + tools/list); not opened by the inventory
          tools: [],
          healthDetail: health.healthDetail,
          checkedAt: health.checkedAt,
        };
        return redact(item) as IntegrationItem;
      }),
    );
  }
}
