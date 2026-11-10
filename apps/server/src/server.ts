import { existsSync } from "node:fs";
import { type Server as HttpServer } from "node:http";
import { type AddressInfo } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAdaptorServer } from "@hono/node-server";

import { type NexoraEnv } from "./config/env";
import { closeDb, type Db, openDb } from "./db/client";
import { createApp } from "./http/app";
import { SessionKeys } from "./http/middleware/session-cookie";
import { registerApiRoutes, registerPublicApiRoutes } from "./http/routes";
import { registerSettingsRoutes } from "./http/routes/settings";
import { registerTokenRoutes } from "./http/routes/tokens";
import { logger as defaultLogger, type Logger } from "./lib/logger";
import { mountMcp } from "./mcp/server";
import { EventBus, EventStore } from "./modules/event-manager";
import { AuditService } from "./modules/permission-manager/audit.service";
import { SettingsService } from "./modules/permission-manager/settings.service";
import { TokenService } from "./modules/permission-manager/token.service";
import { createOrchestrationLayer, type OrchestrationLayer } from "./orchestration";
import { createGateway, type Gateway } from "./realtime/gateway";
import { createTerminalGateway } from "./realtime/terminal-gateway";
import { createServices, type Services } from "./services";

const WEB_PORT = 3022;

/** apps/web/dist, located relative to this module (src/ under tsx, dist/ when bundled). */
function defaultWebDist(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..", "web", "dist");
}

export interface NexoraServer {
  url: string;
  port: number;
  http: HttpServer;
  db: Db;
  bus: EventBus;
  store: EventStore;
  audit: AuditService;
  gateway: Gateway;
  services: Services;
  /** US2 runtimes + orchestration */
  us2: OrchestrationLayer;
  /** graceful stop: runtimes → realtime → HTTP → flush events → DB */
  close(): Promise<void>;
}

export interface CreateServerOptions {
  env: NexoraEnv;
  logger?: Logger;
  /** override SPA location; `null` disables static serving */
  webDistDir?: string | null;
}

/** Wire config → DB → modules → Hono + Socket.IO on one HTTP server and start listening. */
export async function createNexoraServer(opts: CreateServerOptions): Promise<NexoraServer> {
  const { env } = opts;
  const log = opts.logger ?? defaultLogger;
  const startedAt = Date.now();

  const db = openDb({ dataDir: env.dataDir });
  const bus = new EventBus();
  const store = new EventStore(db, bus);
  const audit = new AuditService(db);
  const keys = new SessionKeys();
  // the gateway needs the HTTP server, which needs the app — stats reach it late-bound
  const live: { gateway?: Gateway } = {};
  const services = createServices({
    db,
    env,
    bus,
    store,
    audit,
    logger: log,
    publishStats: (stats) => live.gateway?.publishStats(stats),
  });
  const us2 = createOrchestrationLayer({ db, env, bus, store, audit, logger: log, services });
  // US8: API tokens (hashed) + settings; tokens authenticate only /mcp and the read-only /live socket —
  // never the REST API, which has no per-scope checks (a read token must not reach control routes)
  const tokens = new TokenService({ db, audit });
  const settings = new SettingsService({ db, audit, env });
  const ports = [...new Set([env.port, WEB_PORT])];

  const serveSpa = env.nodeEnv !== "development" && opts.webDistDir !== null;
  const webDistDir = opts.webDistDir ?? defaultWebDist();
  if (serveSpa && !existsSync(join(webDistDir, "index.html"))) {
    log.warn({ webDistDir }, "web build not found — run `npm run build`; API still available");
  }

  const app = createApp({
    env,
    db,
    startedAt,
    logger: log,
    keys,
    registerPublicRoutes: (api) => registerPublicApiRoutes(api, services),
    registerRoutes: (api) => {
      registerApiRoutes(api, services);
      us2.registerRoutes(api);
      registerTokenRoutes(api, { tokens, audit });
      registerSettingsRoutes(api, { settings, audit });
    },
    registerRootRoutes: (root) =>
      mountMcp(root, {
        orchestration: us2.orchestration,
        controls: us2.controls,
        sessions: services.sessions,
        agents: services.agents,
        store,
        audit,
        tokens,
        settings,
        publicUrl: env.publicUrl,
        logger: log,
      }),
    ...(serveSpa ? { webDistDir } : {}),
  });

  const http = createAdaptorServer({ fetch: app.fetch }) as HttpServer;
  const gateway = createGateway({
    httpServer: http,
    store,
    bus,
    keys,
    policy: { remote: env.remote, ports },
    envToken: env.token,
    verifyApiToken: tokens.verifier,
  });
  live.gateway = gateway;
  // US6: /terminal namespace for Nexora-started Agent Teams leads (same io, auth and origin check)
  const terminal = us2.agentTeams
    ? createTerminalGateway({
        io: gateway.io,
        auth: { keys, envToken: env.token },
        terminals: us2.agentTeams,
        sessions: services.sessions,
        audit,
      })
    : null;

  await new Promise<void>((resolveListen, reject) => {
    http.once("error", reject);
    http.listen(env.port, env.host, () => resolveListen());
  });
  const port = (http.address() as AddressInfo).port;
  const url = `http://${env.host.includes(":") ? `[${env.host}]` : env.host}:${port}`;
  if (env.testFakeRuntime) log.warn("NEXORA_TEST_FAKE_RUNTIME=1 — test-only fake runtime enabled");
  log.info(
    { url, dataDir: env.dataDir, remote: env.remote, nodeEnv: env.nodeEnv },
    "nexora listening",
  );

  let closed = false;
  return {
    url,
    port,
    http,
    db,
    bus,
    store,
    audit,
    gateway,
    services,
    us2,
    close: async () => {
      if (closed) return;
      closed = true;
      await us2.close();
      services.close();
      terminal?.close();
      await gateway.close();
      await new Promise<void>((r) => http.close(() => r()));
      await services.sessionProjection.settled();
      store.close();
      closeDb(db);
      log.info("nexora stopped");
    },
  };
}
