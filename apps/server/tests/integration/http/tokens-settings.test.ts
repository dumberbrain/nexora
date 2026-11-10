import {
  ApiTokenListSchema,
  ApiTokenSchema,
  CreateApiTokenResultSchema,
  SettingsSchema,
} from "@ubuliera/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDb, openDb, type Db } from "../../../src/db/client";
import { createApp } from "../../../src/http/app";
import { registerSettingsRoutes } from "../../../src/http/routes/settings";
import { registerTokenRoutes } from "../../../src/http/routes/tokens";
import { createLogger } from "../../../src/lib/logger";
import { AuditService } from "../../../src/modules/permission-manager/audit.service";
import { SettingsService } from "../../../src/modules/permission-manager/settings.service";
import { TokenService } from "../../../src/modules/permission-manager/token.service";
import { HOST, login, testEnv } from "../../helpers/us1";

const ENV_TOKEN = "e".repeat(48);

let db: Db;
let audit: AuditService;
let tokens: TokenService;
let settings: SettingsService;
let app: ReturnType<typeof createApp>;
let auth: { cookie: string; csrf: string };

beforeEach(async () => {
  db = openDb({ dataDir: ":memory:" });
  audit = new AuditService(db);
  tokens = new TokenService({ db, audit });
  const env = { ...testEnv, token: ENV_TOKEN };
  settings = new SettingsService({ db, audit, env });
  app = createApp({
    env,
    db,
    startedAt: Date.now(),
    logger: createLogger({ level: "silent" }),
    verifyApiToken: tokens.verifier,
    registerRoutes: (api) => {
      registerTokenRoutes(api, { tokens, audit });
      registerSettingsRoutes(api, { settings, audit });
    },
  });
  auth = await login(app);
});
afterEach(() => closeDb(db));

const viaSession = (method: string, path: string, body?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    headers: {
      ...HOST,
      cookie: auth.cookie,
      "content-type": "application/json",
      "x-ubuliera-csrf": auth.csrf,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const viaBearer = (token: string, method: string, path: string, body?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    headers: { ...HOST, authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const errorCode = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code;

describe("tokens + settings routes (US8, T152)", () => {
  it("POST /tokens → 201 with the secret once; GET /tokens never returns it", async () => {
    const res = await viaSession("POST", "/tokens", { name: "claude-desktop", scope: "read" });
    expect(res.status).toBe(201);
    const created = CreateApiTokenResultSchema.parse(await res.json());
    const list = await viaSession("GET", "/tokens");
    expect(list.status).toBe(200);
    const body = await list.text();
    expect(ApiTokenListSchema.parse(JSON.parse(body)).items).toEqual([created.token]);
    expect(body).not.toContain(created.secret);
  });

  it("validates input (400) and rejects duplicate names (409)", async () => {
    expect(await errorCode(await viaSession("POST", "/tokens", { name: "", scope: "read" }))).toBe(
      "VALIDATION_FAILED",
    );
    expect(
      await errorCode(await viaSession("POST", "/tokens", { name: "a b", scope: "read" })),
    ).toBe("VALIDATION_FAILED");
    expect(
      await errorCode(await viaSession("POST", "/tokens", { name: "x", scope: "admin" })),
    ).toBe("VALIDATION_FAILED");
    expect((await viaSession("POST", "/tokens", { name: "x", scope: "read" })).status).toBe(201);
    expect((await viaSession("POST", "/tokens", { name: "x", scope: "read" })).status).toBe(409);
  });

  it("DELETE /tokens/:id revokes (idempotent); 404 for unknown ids", async () => {
    const created = CreateApiTokenResultSchema.parse(
      await (await viaSession("POST", "/tokens", { name: "tmp", scope: "control" })).json(),
    );
    const first = await viaSession("DELETE", `/tokens/${created.token.id}`);
    expect(first.status).toBe(200);
    const revoked = ApiTokenSchema.parse(await first.json());
    expect(revoked.revokedAt).not.toBeNull();
    const second = await viaSession("DELETE", `/tokens/${created.token.id}`);
    expect(ApiTokenSchema.parse(await second.json()).revokedAt).toBe(revoked.revokedAt);
    expect((await viaSession("DELETE", "/tokens/01JAAAAAAAAAAAAAAAAAAAAAAA")).status).toBe(404);
    expect(tokens.verify(created.secret)).toBeNull();
  });

  it("GET /settings and PUT /settings/mcp (audited)", async () => {
    const initial = SettingsSchema.parse(await (await viaSession("GET", "/settings")).json());
    expect(initial.mcp.enabled).toBe(false);
    expect(initial.remote.envTokenConfigured).toBe(true);
    const put = await viaSession("PUT", "/settings/mcp", { enabled: true });
    expect(put.status).toBe(200);
    expect(SettingsSchema.parse(await put.json()).mcp.enabled).toBe(true);
    expect(settings.mcpEnabled()).toBe(true);
    expect(await errorCode(await viaSession("PUT", "/settings/mcp", { enabled: "yes" }))).toBe(
      "VALIDATION_FAILED",
    );
    expect(
      audit.list({ limit: 20 }).items.filter((a) => a.action === "settings.mcp.update"),
    ).toHaveLength(1);
  });

  it("session-cookie only: bearer callers (env token or API token) get 403, audited as denied", async () => {
    const created = CreateApiTokenResultSchema.parse(
      await (await viaSession("POST", "/tokens", { name: "mcp-agent", scope: "control" })).json(),
    );
    for (const bearer of [ENV_TOKEN, created.secret]) {
      expect((await viaBearer(bearer, "GET", "/tokens")).status).toBe(403);
      expect(
        (await viaBearer(bearer, "POST", "/tokens", { name: "evil", scope: "control" })).status,
      ).toBe(403);
      expect((await viaBearer(bearer, "DELETE", `/tokens/${created.token.id}`)).status).toBe(403);
      expect((await viaBearer(bearer, "GET", "/settings")).status).toBe(403);
      expect((await viaBearer(bearer, "PUT", "/settings/mcp", { enabled: true })).status).toBe(403);
    }
    expect(settings.mcpEnabled()).toBe(false);
    expect(tokens.list().map((t) => t.name)).toEqual(["mcp-agent"]);
    expect(tokens.verify(created.secret)).not.toBeNull();
    const denied = audit.list({ limit: 50 }).items.filter((a) => a.outcome === "denied");
    expect(denied).toHaveLength(10);
    expect(denied.some((a) => a.actor === "mcp_client:mcp-agent")).toBe(true);
    expect(JSON.stringify(denied)).not.toContain(created.secret);
  });

  it("unauthenticated → 401", async () => {
    expect((await app.request("/api/v1/tokens", { headers: HOST })).status).toBe(401);
    expect((await app.request("/api/v1/settings", { headers: HOST })).status).toBe(401);
  });
});
