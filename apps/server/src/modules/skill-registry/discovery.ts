import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { z } from "zod";

import { parseFrontMatter } from "./frontmatter";

/**
 * Skill / command / agent discovery (T088, FR-013). Sources: project `.claude/{skills,commands,
 * agents}`, user `~/.claude/{skills,commands,agents}` and enabled plugins. Read-only; missing or
 * malformed files are skipped, never fatal.
 */
export type DiscoveredKind = "skill" | "command" | "agent_definition";
export type DiscoveryScope = "project" | "user" | "plugin";

export interface AgentDefinition {
  description: string;
  prompt: string;
  tools?: string[];
  model?: string;
}

export interface DiscoveredItem {
  kind: DiscoveredKind;
  scope: DiscoveryScope;
  /** commands in sub-folders use `dir:name`; plugin content is prefixed `plugin:` */
  name: string;
  description: string | null;
  sourcePath: string;
  /** user-invocable skill or command (usable as a workflow step, FR-014) */
  executable: boolean;
  /** only for agent definitions */
  definition?: AgentDefinition;
}

export interface DiscoveryRoots {
  projectRoot: string;
  homeDir: string;
}

const MAX_FILE_BYTES = 256 * 1024;
const MAX_ENTRIES = 500;

async function readSmall(path: string): Promise<string | null> {
  try {
    const s = await stat(path);
    if (!s.isFile() || s.size > MAX_FILE_BYTES) return null;
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function dirEntries(dir: string) {
  try {
    return (await readdir(dir, { withFileTypes: true })).slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

/** Markdown files below `dir`, recursively (bounded depth). */
async function markdownFiles(dir: string, depth = 0): Promise<string[]> {
  if (depth > 4) return [];
  const out: string[] = [];
  for (const e of await dirEntries(dir)) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await markdownFiles(p, depth + 1)));
    else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) out.push(p);
  }
  return out;
}

const prefixed = (prefix: string | null, name: string) => (prefix ? `${prefix}:${name}` : name);

async function skillsIn(dir: string, scope: DiscoveryScope, prefix: string | null) {
  const out: DiscoveredItem[] = [];
  for (const e of await dirEntries(dir)) {
    if (!e.isDirectory()) continue;
    const file = join(dir, e.name, "SKILL.md");
    const text = await readSmall(file);
    if (text === null) continue;
    const { fields } = parseFrontMatter(text);
    out.push({
      kind: "skill",
      scope,
      name: prefixed(prefix, fields.name || e.name),
      description: fields.description || null,
      sourcePath: file,
      executable: fields["user-invocable"] !== "false",
    });
  }
  return out;
}

async function commandsIn(dir: string, scope: DiscoveryScope, prefix: string | null) {
  const out: DiscoveredItem[] = [];
  for (const file of await markdownFiles(dir)) {
    const text = await readSmall(file);
    if (text === null) continue;
    const { fields } = parseFrontMatter(text);
    const name = relative(dir, file).slice(0, -".md".length).split(sep).join(":");
    out.push({
      kind: "command",
      scope,
      name: prefixed(prefix, name),
      description: fields.description || null,
      sourcePath: file,
      executable: true,
    });
  }
  return out;
}

async function agentsIn(dir: string, scope: DiscoveryScope, prefix: string | null) {
  const out: DiscoveredItem[] = [];
  for (const file of await markdownFiles(dir)) {
    const text = await readSmall(file);
    if (text === null) continue;
    const { fields, body } = parseFrontMatter(text);
    const base = file
      .slice(dir.length + 1, -".md".length)
      .split(sep)
      .join(":");
    const tools = (fields.tools ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const definition: AgentDefinition = {
      description: fields.description || fields.name || base,
      prompt: body,
      ...(tools.length > 0 ? { tools } : {}),
      ...(fields.model ? { model: fields.model } : {}),
    };
    out.push({
      kind: "agent_definition",
      scope,
      name: prefixed(prefix, fields.name || base),
      description: fields.description || null,
      sourcePath: file,
      executable: false,
      definition,
    });
  }
  return out;
}

async function scanClaudeDir(dir: string, scope: DiscoveryScope, prefix: string | null) {
  return [
    ...(await skillsIn(join(dir, "skills"), scope, prefix)),
    ...(await commandsIn(join(dir, "commands"), scope, prefix)),
    ...(await agentsIn(join(dir, "agents"), scope, prefix)),
  ];
}

async function readJson(path: string): Promise<unknown> {
  const text = await readSmall(path);
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

const SettingsSchema = z.looseObject({
  enabledPlugins: z.record(z.string(), z.unknown()).optional(),
});
const InstalledPluginsSchema = z.looseObject({
  plugins: z.record(
    z.string(),
    z
      .array(z.looseObject({ installPath: z.string().min(1) }))
      .or(z.looseObject({ installPath: z.string().min(1) })),
  ),
});

/** `name@marketplace` ids enabled in user or project settings (later sources win). */
async function enabledPluginIds(roots: DiscoveryRoots): Promise<Set<string>> {
  const flags = new Map<string, boolean>();
  for (const file of [
    join(roots.homeDir, ".claude", "settings.json"),
    join(roots.projectRoot, ".claude", "settings.json"),
    join(roots.projectRoot, ".claude", "settings.local.json"),
  ]) {
    const parsed = SettingsSchema.safeParse(await readJson(file));
    if (!parsed.success) continue;
    for (const [id, on] of Object.entries(parsed.data.enabledPlugins ?? {})) {
      flags.set(id, on === true);
    }
  }
  return new Set([...flags].filter(([, on]) => on).map(([id]) => id));
}

async function pluginItems(roots: DiscoveryRoots): Promise<DiscoveredItem[]> {
  const enabled = await enabledPluginIds(roots);
  if (enabled.size === 0) return [];
  const parsed = InstalledPluginsSchema.safeParse(
    await readJson(join(roots.homeDir, ".claude", "plugins", "installed_plugins.json")),
  );
  if (!parsed.success) return [];
  const out: DiscoveredItem[] = [];
  for (const [id, entry] of Object.entries(parsed.data.plugins)) {
    if (!enabled.has(id)) continue;
    const pluginName = id.split("@")[0] || id;
    const installs = Array.isArray(entry) ? entry : [entry];
    const installPath = installs[0]?.installPath;
    if (!installPath) continue;
    out.push(...(await scanClaudeDir(installPath, "plugin", pluginName)));
  }
  return out;
}

export async function discoverSkills(roots: DiscoveryRoots): Promise<DiscoveredItem[]> {
  return [
    ...(await scanClaudeDir(join(roots.projectRoot, ".claude"), "project", null)),
    ...(await scanClaudeDir(join(roots.homeDir, ".claude"), "user", null)),
    ...(await pluginItems(roots)),
  ];
}
