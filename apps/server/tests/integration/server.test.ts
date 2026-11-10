import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { io as ioc } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type NexoraEnv } from "../../src/config/env";
import { createLogger } from "../../src/lib/logger";
import { EXTERNAL_OBSERVED_CAPABILITIES } from "../../src/modules/session-manager";
import { createNexoraServer, type NexoraServer } from "../../src/server";

let server: NexoraServer;
let base: string;
let env: NexoraEnv;
const port = 40_000 + Math.floor(Math.random() * 10_000);

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), "nexora-server-"));
  const web = join(base, "web");
  mkdirSync(join(web, "static"), { recursive: true });
  writeFileSync(join(web, "index.html"), "<!doctype html><title>Nexora</title>");
  writeFileSync(join(web, "static", "app.js"), "console.log(1)");
  writeFileSync(join(base, "secret.txt"), "nope");

  env = {
    nodeEnv: "production",
    host: "127.0.0.1",
    port,
    remote: false,
    token: undefined,
    dataDir: join(base, "data"),
    publicUrl: `http://127.0.0.1:${port}`,
    testFakeRuntime: false,
    retentionDays: 30,
  };
  server = await createNexoraServer({
    env,
    webDistDir: web,
    logger: createLogger({ level: "silent" }),
  });
});

afterAll(async () => {
  await server.close();
  rmSync(base, { recursive: true, force: true });
});

const get = (path: string) => fetch(`${server.url}${path}`);

describe("createNexoraServer", () => {
  it("binds to loopback and serves /api/v1/health", async () => {
    expect(server.url).toBe(`http://127.0.0.1:${port}`);
    const res = await get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", db: "ok" });
  });

  it("serves the SPA with fallback for client-side routes", async () => {
    const root = await get("/");
    expect(root.headers.get("content-type")).toContain("text/html");
    expect(await root.text()).toContain("Nexora");
    const deep = await get("/sessions/abc");
    expect(await deep.text()).toContain("Nexora");
    const asset = await get("/static/app.js");
    expect(asset.headers.get("cache-control")).toContain("immutable");
  });

  it("never serves files outside the web dist", async () => {
    const res = await get("/..%2Fsecret.txt");
    expect(await res.text()).not.toBe("nope");
  });

  it("keeps unknown API routes as JSON errors, not the SPA", async () => {
    const res = await get("/api/v1/does-not-exist");
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("accepts an authenticated socket connection on /live", async () => {
    const session = await get("/api/v1/auth/session");
    const cookie = session.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const socket = ioc(`${server.url}/live`, {
      transports: ["websocket"],
      extraHeaders: { cookie },
      reconnection: false,
    });
    await new Promise<void>((resolve, reject) => {
      socket.on("connect", () => resolve());
      socket.on("connect_error", reject);
    });
    socket.disconnect();
  });

  it("on restart marks lost sessions unknown and purges expired events (T157/T158)", async () => {
    const now = Date.now();
    server.services.sessions.insert({
      id: "lost-session",
      executionId: null,
      executionMode: null,
      currentTaskId: null,
      projectId: null,
      runtime: "external_observed",
      observeOnly: true,
      cwd: base,
      gitBranch: null,
      worktreePath: null,
      model: null,
      status: "running",
      capabilities: EXTERNAL_OBSERVED_CAPABILITIES,
      pid: null,
      usage: null,
      lastActivityAt: now,
      startedAt: now,
      endedAt: null,
    });
    const meta = { source: "hook", reliability: "authoritative", severity: "info" } as const;
    const day = 86_400_000;
    server.store.append({ ...meta, ts: now - 40 * day, type: "tool.invoked", summary: "old" });
    server.store.append({ ...meta, ts: now - 40 * day, type: "error", summary: "old error" });
    server.store.append({ ...meta, ts: now, type: "tool.invoked", summary: "fresh" });
    await server.close();

    server = await createNexoraServer({
      env,
      webDistDir: null,
      logger: createLogger({ level: "silent" }),
    });
    expect(server.services.sessions.get("lost-session")?.status).toBe("unknown");
    const summaries = server.store.list({ limit: 10 }).items.map((e) => e.summary);
    expect(summaries.sort()).toEqual(["fresh", "old error"]);
  });
});
