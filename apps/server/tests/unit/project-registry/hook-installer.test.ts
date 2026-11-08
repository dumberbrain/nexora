import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { HOOK_TOKEN_HEADER, HookPreviewSchema } from "@nexora/contracts";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { projects } from "../../../src/db/schema";
import {
  NEXORA_HOOK_EVENTS,
  hasNexoraHooks,
  mergeNexoraHooks,
  removeNexoraHooks,
} from "../../../src/modules/project-registry/hook-installer";
import { createHarness, type Harness } from "../../helpers/us1";

const URL_ = "http://127.0.0.1:3022/api/v1/hooks/ingest";

/** A user's existing settings — must survive install/uninstall untouched. */
const existing = {
  permissions: { allow: ["Bash(npm test)"] },
  hooks: {
    PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo pre" }] }],
    SessionStart: [{ hooks: [{ type: "command", command: "echo hi" }] }],
  },
};

let h: Harness;
let projectId: string;
let settingsPath: string;

beforeEach(async () => {
  h = createHarness();
  projectId = (await h.services.projects.register({ rootPath: h.tmp }, "user")).id;
  settingsPath = join(h.tmp, ".claude", "settings.local.json");
});
afterEach(() => h.close());

const writeSettings = (value: unknown) => {
  mkdirSync(join(h.tmp, ".claude"), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(value, null, 2));
};
const readSettings = () => JSON.parse(readFileSync(settingsPath, "utf8")) as typeof existing;
const nexoraEntries = (settings: unknown) =>
  JSON.stringify(settings).split("/api/v1/hooks/ingest").length - 1;
const row = () => h.db.select().from(projects).where(eq(projects.id, projectId)).get();

describe("pure merge", () => {
  it("adds one http hook per event and keeps existing hooks", () => {
    const merged = mergeNexoraHooks(existing, URL_, "tok");
    expect(nexoraEntries(merged)).toBe(NEXORA_HOOK_EVENTS.length);
    const pre = (merged.hooks as Record<string, unknown[]>).PreToolUse;
    expect(pre?.[0]).toEqual(existing.hooks.PreToolUse[0]);
    expect(pre?.[1]).toMatchObject({
      matcher: "*",
      hooks: [{ type: "http", url: URL_, headers: { [HOOK_TOKEN_HEADER]: "tok" } }],
    });
    expect((merged.hooks as Record<string, unknown[]>).Stop?.[0]).not.toHaveProperty("matcher");
    expect(merged.permissions).toEqual(existing.permissions);
  });

  it("is idempotent and removal restores the original", () => {
    const twice = mergeNexoraHooks(mergeNexoraHooks(existing, URL_, "a"), URL_, "b");
    expect(nexoraEntries(twice)).toBe(NEXORA_HOOK_EVENTS.length);
    expect(JSON.stringify(twice)).not.toContain('"a"');
    expect(removeNexoraHooks(twice)).toEqual(existing);
    expect(hasNexoraHooks(twice)).toBe(true);
    expect(hasNexoraHooks(existing)).toBe(false);
  });

  it("never registers WorktreeCreate/WorktreeRemove (http hooks would replace git behaviour)", () => {
    expect(NEXORA_HOOK_EVENTS).not.toContain("WorktreeCreate");
    expect(NEXORA_HOOK_EVENTS).not.toContain("WorktreeRemove");
    expect(NEXORA_HOOK_EVENTS).toContain("SubagentStart");
  });
});

describe("HookInstaller", () => {
  it("previews a merge of an existing settings file without writing", async () => {
    writeSettings(existing);
    const before = readFileSync(settingsPath, "utf8");
    const preview = HookPreviewSchema.parse(await h.services.hookInstaller.preview(projectId));
    expect(preview.exists).toBe(true);
    expect(preview.before).toBe(before);
    expect(preview.alreadyInstalled).toBe(false);
    expect(preview.events).toEqual([...NEXORA_HOOK_EVENTS]);
    const after = JSON.parse(preview.after) as typeof existing;
    expect(after.hooks.PreToolUse[0]).toEqual(existing.hooks.PreToolUse[0]);
    expect(after.hooks.SessionStart).toEqual(existing.hooks.SessionStart);
    expect(preview.after).toContain(URL_);
    expect(preview.after.startsWith("{\n  ")).toBe(true);
    expect(readFileSync(settingsPath, "utf8")).toBe(before);
  });

  it("previews a new file when none exists", async () => {
    const preview = await h.services.hookInstaller.preview(projectId);
    expect(preview).toMatchObject({ exists: false, before: null, alreadyInstalled: false });
    expect(existsSync(settingsPath)).toBe(false);
  });

  it("installs: creates .claude, writes atomically, stores only the token hash", async () => {
    const project = await h.services.hookInstaller.install(projectId, "user");
    expect(project.hooksInstalled).toBe(true);
    const settings = readSettings() as unknown as {
      hooks: Record<string, { hooks: { headers: Record<string, string> }[] }[]>;
    };
    const token = settings.hooks.Stop?.[0]?.hooks[0]?.headers[HOOK_TOKEN_HEADER] ?? "";
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(row()?.hookTokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(JSON.stringify(project)).not.toContain(token);
    expect(readdirSync(join(h.tmp, ".claude"))).toEqual(["settings.local.json"]);
  });

  it("merges into existing settings, is idempotent, and rotates the token", async () => {
    writeSettings(existing);
    await h.services.hookInstaller.install(projectId, "user");
    const hash1 = row()?.hookTokenHash;
    await h.services.hookInstaller.install(projectId, "user");
    const settings = readSettings();
    expect(nexoraEntries(settings)).toBe(NEXORA_HOOK_EVENTS.length);
    expect(settings.permissions).toEqual(existing.permissions);
    expect(settings.hooks.PreToolUse[0]).toEqual(existing.hooks.PreToolUse[0]);
    expect(row()?.hookTokenHash).not.toBe(hash1);
    expect((await h.services.hookInstaller.preview(projectId)).alreadyInstalled).toBe(true);
  });

  it("uninstall removes only Nexora entries", async () => {
    writeSettings(existing);
    await h.services.hookInstaller.install(projectId, "user");
    const project = await h.services.hookInstaller.uninstall(projectId, "user");
    expect(project.hooksInstalled).toBe(false);
    expect(readSettings()).toEqual(existing);
    expect(row()?.hookTokenHash).toBeNull();
  });

  it("refuses to touch a settings file that is not valid JSON", async () => {
    mkdirSync(join(h.tmp, ".claude"), { recursive: true });
    writeFileSync(settingsPath, "{ nope");
    await expect(h.services.hookInstaller.install(projectId, "user")).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(readFileSync(settingsPath, "utf8")).toBe("{ nope");
  });

  it("audits install and uninstall without the token", async () => {
    await h.services.hookInstaller.install(projectId, "user");
    const token = /"X-Nexora-Hook-Token": "([^"]+)"/.exec(readFileSync(settingsPath, "utf8"))?.[1];
    expect(token).toBeTruthy();
    await h.services.hookInstaller.uninstall(projectId, "user");
    const actions = h.audit.list({ limit: 10 }).items.map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining(["project.hooks.install", "project.hooks.uninstall"]),
    );
    expect(JSON.stringify(h.audit.list({ limit: 10 }))).not.toContain(token ?? "-");
  });
});
