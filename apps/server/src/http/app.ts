import { type Health } from "@ubuliera/contracts";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";

import { type UbulieraEnv } from "../config/env";
import { type Db, pingDb } from "../db/client";
import { logger as defaultLogger, type Logger } from "../lib/logger";
import { SERVER_VERSION } from "../version";
import { type AppBindings } from "./context";
import { AppError } from "./errors";
import { authenticate, bearerToken, type ApiTokenVerifier } from "./middleware/bearer-auth";
import { csrfProtection } from "./middleware/csrf";
import { errorMapper, notFound } from "./middleware/error-mapper";
import { originGuard } from "./middleware/origin-guard";
import { clearSession, issueSession, safeEqual, SessionKeys } from "./middleware/session-cookie";
import { registerStaticSpa } from "./static-spa";

export interface AppDeps {
  env: UbulieraEnv;
  db: Db;
  startedAt: number;
  logger?: Logger;
  verifyApiToken?: ApiTokenVerifier;
  keys?: SessionKeys;
  /** registers authenticated module routes under /api/v1 (added per user story) */
  registerRoutes?: (api: Hono<AppBindings>) => void;
  /**
   * registers PUBLIC routes under /api/v1, mounted before session/CSRF auth — only for callers
   * that bring their own credential check (e.g. hook ingest with X-Ubuliera-Hook-Token)
   */
  registerPublicRoutes?: (api: Hono<AppBindings>) => void;
  /**
   * registers routes at the app ROOT (outside /api/v1) before the SPA catch-all — e.g. the
   * optional MCP endpoint `/mcp`, which brings its own bearer-token auth
   */
  registerRootRoutes?: (app: Hono<AppBindings>) => void;
  /** built SPA directory served on non-API paths (production / e2e) */
  webDistDir?: string;
}

/** Ports whose loopback Host is accepted: our own + the web dev server that proxies to us. */
const WEB_PORT = 3022;

export function createApp(deps: AppDeps): Hono<AppBindings> {
  const log = deps.logger ?? defaultLogger;
  const keys = deps.keys ?? new SessionKeys();
  const app = new Hono<AppBindings>();

  app.use(
    "*",
    secureHeaders({
      xFrameOptions: "DENY",
      referrerPolicy: "no-referrer",
      crossOriginResourcePolicy: "same-origin",
      strictTransportSecurity: false,
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // React Flow / xterm set inline style attributes
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    }),
  );
  app.use(
    "*",
    originGuard({ remote: deps.env.remote, ports: [...new Set([deps.env.port, WEB_PORT])] }),
  );

  const api = new Hono<AppBindings>();

  // ---- public ----
  api.get("/health", (c) => {
    const dbOk = pingDb(deps.db);
    const body: Health = {
      status: dbOk ? "ok" : "degraded",
      version: SERVER_VERSION,
      db: dbOk ? "ok" : "down",
      uptimeMs: Date.now() - deps.startedAt,
    };
    return c.json(body, dbOk ? 200 : 503);
  });

  /** Loopback: issue session + csrf cookies. Remote: only for a valid bearer token. */
  api.get("/auth/session", (c) => {
    if (deps.env.remote) {
      const token = bearerToken(c.req.header("authorization"));
      if (!safeEqual(token, deps.env.token)) {
        throw new AppError("UNAUTHENTICATED", "Remote access requires the configured token");
      }
    }
    issueSession(c, keys, deps.env.remote);
    return c.json({ ok: true });
  });

  deps.registerPublicRoutes?.(api);

  // ---- authenticated ----
  api.use(
    "*",
    authenticate({
      keys,
      envToken: deps.env.token,
      ...(deps.verifyApiToken ? { verifyApiToken: deps.verifyApiToken } : {}),
    }),
  );
  api.use("*", csrfProtection(keys));

  api.get("/auth/whoami", (c) => c.json({ actor: c.get("actor"), method: c.get("authMethod") }));
  api.post("/auth/logout", (c) => {
    clearSession(c);
    return c.body(null, 204);
  });

  deps.registerRoutes?.(api);

  app.route("/api/v1", api);
  deps.registerRootRoutes?.(app);
  if (deps.webDistDir) registerStaticSpa(app, deps.webDistDir);
  app.notFound(notFound);
  app.onError(errorMapper(log));
  return app;
}
