import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { HOOK_TOKEN_HEADER, type HookPreview, type Project } from "@nexora/contracts";

import { type ProjectRepository, type ProjectRow, toProject } from "./project.repository";
import { AppError } from "../../http/errors";
import { PathGuardError, resolveInsideRoot } from "../../lib/path-guard";
import { type AuditService } from "../permission-manager/audit.service";

/**
 * Hook installer (T056, FR-041): merges Nexora `http` hooks into the project's
 * `.claude/settings.local.json` (git-ignored by Claude Code). Existing non-Nexora hooks and
 * settings are never removed or altered; Nexora entries are recognised by their ingest URL.
 *
 * WorktreeCreate/WorktreeRemove are deliberately NOT registered: a hook on those events replaces
 * Claude Code's own git worktree handling, so an observe-only `{}` response would break it.
 */
export const NEXORA_HOOK_EVENTS = [
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "PermissionDenied",
  "Notification",
  "SubagentStart",
  "SubagentStop",
  "TaskCreated",
  "TaskCompleted",
  "TeammateIdle",
  "Stop",
  "StopFailure",
  "SessionEnd",
  "CwdChanged",
] as const;

/** Events whose matcher selects tool names. */
const TOOL_EVENTS = new Set<string>([
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "PermissionDenied",
]);

export const INGEST_PATH = "/api/v1/hooks/ingest";
/** Shown in previews instead of a secret; the real token is generated on install. */
export const HOOK_TOKEN_PLACEHOLDER = "<generated on install>";
/** seconds Claude Code waits for our (always immediate) response */
const HOOK_TIMEOUT_S = 10;

type JsonObject = Record<string, unknown>;

const isObject = (v: unknown): v is JsonObject =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function ingestUrl(publicUrl: string): string {
  return `${publicUrl.replace(/\/+$/, "")}${INGEST_PATH}`;
}

export function isNexoraHook(hook: unknown): boolean {
  return (
    isObject(hook) &&
    hook.type === "http" &&
    typeof hook.url === "string" &&
    hook.url.endsWith(INGEST_PATH)
  );
}

export function hasNexoraHooks(settings: JsonObject): boolean {
  if (!isObject(settings.hooks)) return false;
  return Object.values(settings.hooks).some(
    (groups) =>
      Array.isArray(groups) &&
      groups.some((g) => isObject(g) && Array.isArray(g.hooks) && g.hooks.some(isNexoraHook)),
  );
}

/** Remove every Nexora hook; groups/events/`hooks` emptied by that removal are dropped. */
export function removeNexoraHooks(settings: JsonObject): JsonObject {
  const hooks = settings.hooks;
  if (!isObject(hooks)) return { ...settings };
  const next: JsonObject = {};
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) {
      next[event] = groups;
      continue;
    }
    const kept: unknown[] = [];
    for (const group of groups) {
      if (!isObject(group) || !Array.isArray(group.hooks)) {
        kept.push(group);
        continue;
      }
      const remaining = group.hooks.filter((h) => !isNexoraHook(h));
      if (remaining.length === group.hooks.length) kept.push(group);
      else if (remaining.length > 0) kept.push({ ...group, hooks: remaining });
    }
    if (kept.length > 0 || groups.length === 0) next[event] = kept;
  }
  const out: JsonObject = { ...settings, hooks: next };
  if (Object.keys(next).length === 0 && Object.keys(hooks).length > 0) delete out.hooks;
  return out;
}

/** Replace any previous Nexora hooks with one `http` hook per event (idempotent). */
export function mergeNexoraHooks(settings: JsonObject, url: string, token: string): JsonObject {
  const base = removeNexoraHooks(settings);
  const hooks: JsonObject = isObject(base.hooks) ? { ...base.hooks } : {};
  for (const event of NEXORA_HOOK_EVENTS) {
    const entry = {
      ...(TOOL_EVENTS.has(event) ? { matcher: "*" } : {}),
      hooks: [
        { type: "http", url, headers: { [HOOK_TOKEN_HEADER]: token }, timeout: HOOK_TIMEOUT_S },
      ],
    };
    const existing = hooks[event];
    if (existing !== undefined && !Array.isArray(existing)) {
      throw new AppError("VALIDATION_FAILED", `settings hooks.${event} is not an array`);
    }
    const prior: unknown[] = existing ?? [];
    hooks[event] = [...prior, entry];
  }
  return { ...base, hooks };
}

const pretty = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

interface SettingsFile {
  path: string;
  exists: boolean;
  text: string | null;
  value: JsonObject;
}

export interface HookInstallerDeps {
  repo: ProjectRepository;
  audit: AuditService;
  publicUrl: string;
}

export class HookInstaller {
  constructor(private readonly deps: HookInstallerDeps) {}

  async preview(projectId: string): Promise<HookPreview> {
    const project = this.project(projectId);
    const file = await this.read(project);
    const after = mergeNexoraHooks(file.value, this.url, HOOK_TOKEN_PLACEHOLDER);
    return {
      settingsPath: file.path,
      exists: file.exists,
      before: file.text,
      after: pretty(after),
      events: [...NEXORA_HOOK_EVENTS],
      alreadyInstalled: hasNexoraHooks(file.value),
    };
  }

  /** Writes the hooks with a fresh token (reinstall rotates it); only its hash is stored. */
  async install(projectId: string, actor: string): Promise<Project> {
    const project = this.project(projectId);
    const file = await this.read(project);
    const token = randomBytes(32).toString("base64url");
    await this.write(file.path, pretty(mergeNexoraHooks(file.value, this.url, token)));
    const updated = this.deps.repo.setHooks(project.id, true, hashToken(token)) ?? project;
    this.deps.audit.record({
      actor,
      action: "project.hooks.install",
      targetType: "project",
      targetId: project.id,
      outcome: "success",
      details: { settingsPath: file.path, events: NEXORA_HOOK_EVENTS.length, url: this.url },
    });
    return toProject(updated);
  }

  async uninstall(projectId: string, actor: string): Promise<Project> {
    const project = this.project(projectId);
    const file = await this.read(project);
    const fileChanged = file.exists && hasNexoraHooks(file.value);
    if (fileChanged) await this.write(file.path, pretty(removeNexoraHooks(file.value)));
    const updated = this.deps.repo.setHooks(project.id, false, null) ?? project;
    this.deps.audit.record({
      actor,
      action: "project.hooks.uninstall",
      targetType: "project",
      targetId: project.id,
      outcome: "success",
      details: { settingsPath: file.path, fileChanged },
    });
    return toProject(updated);
  }

  private get url(): string {
    return ingestUrl(this.deps.publicUrl);
  }

  private project(id: string): ProjectRow {
    const row = this.deps.repo.get(id);
    if (!row) throw new AppError("NOT_FOUND", "Project not found");
    return row;
  }

  private async read(project: ProjectRow): Promise<SettingsFile> {
    let path: string;
    try {
      path = await resolveInsideRoot(
        project.rootPath,
        join(project.rootPath, ".claude", "settings.local.json"),
      );
    } catch (err) {
      if (err instanceof PathGuardError) throw new AppError("FORBIDDEN", err.message);
      throw new AppError("VALIDATION_FAILED", "Project root is no longer accessible");
    }
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { path, exists: false, text: null, value: {} };
      }
      throw err;
    }
    let value: unknown;
    try {
      value = text.trim() === "" ? {} : JSON.parse(text);
    } catch {
      throw new AppError(
        "VALIDATION_FAILED",
        `${path} is not valid JSON — fix it before installing hooks`,
      );
    }
    if (!isObject(value)) {
      throw new AppError("VALIDATION_FAILED", `${path} must contain a JSON object`);
    }
    return { path, exists: true, text, value };
  }

  /** Atomic replace: write a sibling temp file, then rename over the target. */
  private async write(path: string, content: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.${randomBytes(6).toString("hex")}.tmp`;
    await writeFile(tmp, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
    try {
      await rename(tmp, path);
    } catch (err) {
      await rm(tmp, { force: true });
      throw err;
    }
  }
}
