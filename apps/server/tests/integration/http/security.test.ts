import { HealthSchema } from "@ubuliera/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { type UbulieraEnv } from "../../../src/config/env";
import { closeDb, openDb, type Db } from "../../../src/db/client";
import { createApp } from "../../../src/http/app";

const TOKEN = "r".repeat(40);
const baseEnv: UbulieraEnv = {
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

let db: Db | undefined;
afterEach(() => {
  if (db) closeDb(db);
  db = undefined;
});

function setup(env: Partial<UbulieraEnv> = {}) {
  db = openDb({ dataDir: ":memory:" });
  return createApp({ env: { ...baseEnv, ...env }, db, startedAt: Date.now() });
}

const HOST = { host: "127.0.0.1:3022" };

/** Collect Set-Cookie values into a Cookie header + the csrf token. */
async function login(app: ReturnType<typeof setup>) {
  const res = await app.request("/api/v1/auth/session", { headers: HOST });
  expect(res.status).toBe(200);
  const setCookies = res.headers.getSetCookie();
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  const csrf = /ubuliera_csrf=([^;]+)/.exec(cookie)?.[1];
  expect(csrf).toBeTruthy();
  return { cookie, csrf: csrf! };
}

describe("security middleware", () => {
  it("serves /health without auth and with the documented shape", async () => {
    const app = setup();
    const res = await app.request("/api/v1/health", { headers: HOST });
    expect(res.status).toBe(200);
    const body = HealthSchema.parse(await res.json());
    expect(body.db).toBe("ok");
  });

  it("sets secure headers", async () => {
    const res = await setup().request("/api/v1/health", { headers: HOST });
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("rejects a foreign Host header (DNS rebinding)", async () => {
    const res = await setup().request("/api/v1/health", { headers: { host: "evil.example:3022" } });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("FORBIDDEN");
  });

  it("accepts localhost and [::1] on the dev-proxy port too", async () => {
    const app = setup({ port: 3023 });
    for (const host of ["localhost:3022", "[::1]:3023", "127.0.0.1:3023"]) {
      expect((await app.request("/api/v1/health", { headers: { host } })).status).toBe(200);
    }
  });

  it("rejects a foreign Origin", async () => {
    const res = await setup().request("/api/v1/health", {
      headers: { ...HOST, origin: "http://evil.example" },
    });
    expect(res.status).toBe(403);
  });

  it("requires a session for API routes", async () => {
    const res = await setup().request("/api/v1/auth/whoami", { headers: HOST });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("UNAUTHENTICATED");
  });

  it("issues HttpOnly SameSite=Strict session cookie on loopback", async () => {
    const res = await setup().request("/api/v1/auth/session", { headers: HOST });
    const session = res.headers.getSetCookie().find((c) => c.startsWith("ubuliera_session="));
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Strict/i);
  });

  it("accepts a valid session for reads", async () => {
    const app = setup();
    const { cookie } = await login(app);
    const res = await app.request("/api/v1/auth/whoami", { headers: { ...HOST, cookie } });
    expect(res.status).toBe(200);
  });

  it("rejects mutating requests without the CSRF header", async () => {
    const app = setup();
    const { cookie } = await login(app);
    const res = await app.request("/api/v1/auth/logout", {
      method: "POST",
      headers: { ...HOST, cookie },
    });
    expect(res.status).toBe(403);
  });

  it("rejects a mismatching CSRF header", async () => {
    const app = setup();
    const { cookie } = await login(app);
    const res = await app.request("/api/v1/auth/logout", {
      method: "POST",
      headers: { ...HOST, cookie, "x-ubuliera-csrf": "wrong" },
    });
    expect(res.status).toBe(403);
  });

  it("accepts mutating requests with a matching CSRF header", async () => {
    const app = setup();
    const { cookie, csrf } = await login(app);
    const res = await app.request("/api/v1/auth/logout", {
      method: "POST",
      headers: { ...HOST, cookie, "x-ubuliera-csrf": csrf },
    });
    expect(res.status).toBe(204);
  });

  describe("remote mode", () => {
    const remote = { host: "0.0.0.0", remote: true, token: TOKEN } as const;

    it("does not auto-issue sessions without a bearer token", async () => {
      const res = await setup(remote).request("/api/v1/auth/session", {
        headers: { host: "ubuliera.lan:3022" },
      });
      expect(res.status).toBe(401);
    });

    it("rejects a wrong bearer token", async () => {
      const res = await setup(remote).request("/api/v1/auth/whoami", {
        headers: { host: "ubuliera.lan:3022", authorization: "Bearer nope" },
      });
      expect(res.status).toBe(401);
    });

    it("accepts the configured bearer token, without CSRF, from any Host", async () => {
      const app = setup(remote);
      const headers = { host: "ubuliera.lan:3022", authorization: `Bearer ${TOKEN}` };
      expect((await app.request("/api/v1/auth/whoami", { headers })).status).toBe(200);
      expect((await app.request("/api/v1/auth/logout", { method: "POST", headers })).status).toBe(
        204,
      );
    });
  });

  it("maps unknown routes to the error shape", async () => {
    const app = setup();
    const { cookie } = await login(app);
    const res = await app.request("/api/v1/nope", { headers: { ...HOST, cookie } });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("NOT_FOUND");
  });
});
