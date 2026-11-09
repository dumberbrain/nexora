import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import { type APIRequestContext, expect } from "@playwright/test";

import { removeTempRepo } from "./temp-repo";

const FIXTURES = fileURLToPath(new URL("../../apps/server/tests/fixtures/hooks/", import.meta.url));

/** Values from the recorded spike-S1 session (apps/server/tests/fixtures/hooks). */
export const S1 = {
  sessionId: "7448f0f2-4201-4d73-a3bc-92657df6269f",
  subagentId: "ae0883f726e201b87",
  subagentType: "general-purpose",
  writtenFile: "hello.txt",
} as const;

async function login(api: APIRequestContext): Promise<string> {
  const res = await api.get("/api/v1/auth/session");
  expect(res.ok()).toBeTruthy();
  const csrf = (await api.storageState()).cookies.find((c) => c.name === "nexora_csrf")?.value;
  expect(csrf).toBeTruthy();
  return csrf!;
}

/**
 * Register a throw-away project, install hooks with explicit confirmation, then replay the
 * recorded Claude Code hook payloads through the public ingest endpoint with the real token.
 */
export async function seedObservedSession(
  api: APIRequestContext,
): Promise<{ name: string; cleanup: () => void }> {
  const csrf = await login(api);
  const root = mkdtempSync(join(tmpdir(), "nexora-e2e-project-"));
  const headers = { "x-nexora-csrf": csrf };
  const name = basename(root);

  const project = await api.post("/api/v1/projects", {
    headers,
    // unique per run: CI runs every browser project (and retries) against one server
    data: { rootPath: root, name },
  });
  expect(project.status()).toBe(201);
  const { id } = (await project.json()) as { id: string };

  const install = await api.post(`/api/v1/projects/${id}/hooks/install`, {
    headers,
    data: { confirm: true },
  });
  expect(install.ok()).toBeTruthy();

  const settings = JSON.parse(
    readFileSync(join(root, ".claude", "settings.local.json"), "utf8"),
  ) as { hooks: Record<string, Array<{ hooks: Array<{ headers: Record<string, string> }> }>> };
  const token = settings.hooks.PreToolUse![0]!.hooks[0]!.headers["X-Nexora-Hook-Token"]!;

  for (const file of readdirSync(FIXTURES).sort()) {
    const body = readFileSync(join(FIXTURES, file), "utf8");
    const res = await api.post("/api/v1/hooks/ingest", {
      headers: { "content-type": "application/json", "X-Nexora-Hook-Token": token },
      data: body,
    });
    expect(res.status(), file).toBe(200);
  }
  return { name, cleanup: () => removeTempRepo(root) };
}
