import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { HOOK_TOKEN_HEADER, type Stats } from "@nexora/contracts";
import { expect } from "vitest";

import { type NexoraEnv } from "../../src/config/env";
import { closeDb, openDb, type Db } from "../../src/db/client";
import { createApp } from "../../src/http/app";
import { registerApiRoutes, registerPublicApiRoutes } from "../../src/http/routes";
import { createLogger } from "../../src/lib/logger";
import { EventBus, EventStore } from "../../src/modules/event-manager";
import { AuditService } from "../../src/modules/permission-manager/audit.service";
import { createServices, type Services } from "../../src/services";

export const HOST = { host: "127.0.0.1:3022" };

export const testEnv: NexoraEnv = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 3022,
  remote: false,
  token: undefined,
  dataDir: ":memory:",
  publicUrl: "http://127.0.0.1:3022",
  testFakeRuntime: false,
  retentionDays: 30,
};

const FIXTURE_DIR = join(import.meta.dirname, "..", "fixtures", "hooks");

/** The recorded Claude Code 2.1.319 hook payloads (spike S1), in delivery order. */
export function hookFixtures(): { name: string; body: Record<string, unknown> }[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((name) => ({
      name,
      body: JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf8")) as Record<string, unknown>,
    }));
}

export interface Harness {
  db: Db;
  bus: EventBus;
  store: EventStore;
  audit: AuditService;
  services: Services;
  app: ReturnType<typeof createApp>;
  published: Stats[];
  tmp: string;
  /** git branch the fake resolver reports */
  gitCalls: string[];
  close(): void;
}

/** Full US1 wiring on an in-memory DB with a fake git resolver (no processes spawned). */
export function createHarness(
  opts: { gitBranch?: string | null; gitFails?: boolean } = {},
): Harness {
  const db = openDb({ dataDir: ":memory:" });
  const bus = new EventBus();
  const store = new EventStore(db, bus, { batchMs: 5 });
  const audit = new AuditService(db);
  const published: Stats[] = [];
  const gitCalls: string[] = [];
  const services = createServices({
    db,
    env: testEnv,
    bus,
    store,
    audit,
    logger: createLogger({ level: "silent" }),
    gitBranch: (cwd) => {
      gitCalls.push(cwd);
      if (opts.gitFails) return Promise.reject(new Error("git exploded"));
      return Promise.resolve(opts.gitBranch === undefined ? "main" : opts.gitBranch);
    },
    publishStats: (s) => published.push(s),
    statsIntervalMs: 0,
  });
  const app = createApp({
    env: testEnv,
    db,
    startedAt: Date.now(),
    logger: createLogger({ level: "silent" }),
    registerPublicRoutes: (api) => registerPublicApiRoutes(api, services),
    registerRoutes: (api) => registerApiRoutes(api, services),
  });
  const tmp = mkdtempSync(join(tmpdir(), "nexora-us1-"));
  return {
    db,
    bus,
    store,
    audit,
    services,
    app,
    published,
    tmp,
    gitCalls,
    close: () => {
      services.close();
      store.close();
      closeDb(db);
      rmSync(tmp, { recursive: true, force: true });
    },
  };
}

/** Loopback session cookie + CSRF token (same flow as the web app). */
export async function login(app: Harness["app"]): Promise<{ cookie: string; csrf: string }> {
  const res = await app.request("/api/v1/auth/session", { headers: HOST });
  expect(res.status).toBe(200);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const csrf = /nexora_csrf=([^;]+)/.exec(cookie)?.[1];
  expect(csrf).toBeTruthy();
  return { cookie, csrf: csrf ?? "" };
}

/** Register a temp project and install hooks; returns the project id and its ingest token. */
export async function connectProject(h: Harness): Promise<{ projectId: string; token: string }> {
  const project = await h.services.projects.register({ rootPath: h.tmp }, "user");
  await h.services.hookInstaller.install(project.id, "user");
  const settings = JSON.parse(
    readFileSync(join(h.tmp, ".claude", "settings.local.json"), "utf8"),
  ) as { hooks: Record<string, { hooks: { headers: Record<string, string> }[] }[]> };
  const token = settings.hooks.Stop?.[0]?.hooks[0]?.headers[HOOK_TOKEN_HEADER];
  expect(token).toBeTruthy();
  return { projectId: project.id, token: token ?? "" };
}

export function postHook(
  h: Harness,
  body: unknown,
  token: string | undefined,
  env?: Record<string, unknown>,
) {
  return h.app.request(
    "/api/v1/hooks/ingest",
    {
      method: "POST",
      headers: {
        ...HOST,
        "content-type": "application/json",
        ...(token === undefined ? {} : { [HOOK_TOKEN_HEADER]: token }),
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
    env,
  );
}
