import { SettingsSchema } from "@nexora/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDb, openDb, type Db } from "../../../src/db/client";
import { AuditService } from "../../../src/modules/permission-manager/audit.service";
import { SettingsService } from "../../../src/modules/permission-manager/settings.service";
import { testEnv } from "../../helpers/us1";

let db: Db;
let audit: AuditService;
let settings: SettingsService;

beforeEach(() => {
  db = openDb({ dataDir: ":memory:" });
  audit = new AuditService(db);
  settings = new SettingsService({ db, audit, env: testEnv });
});
afterEach(() => closeDb(db));

describe("SettingsService (US8)", () => {
  it("MCP is disabled by default", () => {
    expect(settings.mcpEnabled()).toBe(false);
    const view = SettingsSchema.parse(settings.view());
    expect(view.mcp).toEqual({ enabled: false, endpoint: "http://127.0.0.1:3022/mcp" });
  });

  it("toggles MCP, persists and audits each change", () => {
    expect(settings.setMcpEnabled(true, "user").mcp.enabled).toBe(true);
    expect(settings.mcpEnabled()).toBe(true);
    // a second service on the same DB sees the stored value
    expect(new SettingsService({ db, audit, env: testEnv }).mcpEnabled()).toBe(true);
    settings.setMcpEnabled(false, "user");
    expect(settings.mcpEnabled()).toBe(false);
    const entries = audit
      .list({ limit: 10 })
      .items.filter((a) => a.action === "settings.mcp.update");
    expect(entries.map((e) => e.details)).toEqual([
      { enabled: false, previous: true },
      { enabled: true, previous: false },
    ]);
    expect(entries.every((e) => e.actor === "user" && e.outcome === "success")).toBe(true);
  });

  it("reports remote access read-only from the environment", () => {
    expect(settings.view().remote).toEqual({
      enabled: false,
      host: "127.0.0.1",
      port: 3022,
      envTokenConfigured: false,
    });
    const remote = new SettingsService({
      db,
      audit,
      env: {
        ...testEnv,
        remote: true,
        host: "0.0.0.0",
        token: "x".repeat(40),
        publicUrl: "https://nexora.example",
      },
    });
    expect(remote.view()).toEqual({
      mcp: { enabled: false, endpoint: "https://nexora.example/mcp" },
      remote: { enabled: true, host: "0.0.0.0", port: 3022, envTokenConfigured: true },
    });
    expect(JSON.stringify(remote.view())).not.toContain("xxxx");
  });
});
