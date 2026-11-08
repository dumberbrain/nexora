import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDb, openDb, type Db } from "../../../src/db/client";
import { REDACTED } from "../../../src/lib/redactor";
import { AuditService } from "../../../src/modules/permission-manager/audit.service";

let db: Db;
let audit: AuditService;
beforeEach(() => {
  db = openDb({ dataDir: ":memory:" });
  audit = new AuditService(db, () => 1_700_000_000_000);
});
afterEach(() => closeDb(db));

describe("AuditService", () => {
  it("records entries with actor, action, target, outcome and timestamp", () => {
    const e = audit.record({
      actor: "user",
      action: "hooks.install",
      targetType: "project",
      targetId: "p1",
      outcome: "success",
    });
    expect(e.ts).toBe(1_700_000_000_000);
    expect(audit.list({ limit: 10 }).items).toEqual([e]);
  });

  it("redacts details before storing", () => {
    audit.record({
      actor: "mcp_client:cursor",
      action: "session.message",
      targetType: "session",
      targetId: "s1",
      outcome: "denied",
      details: { headers: { authorization: "Bearer secretvalue1" } },
    });
    const raw = JSON.stringify(db.$client.prepare("select details from audit_entries").all());
    expect(raw).not.toContain("secretvalue1");
    expect(raw).toContain(REDACTED);
  });

  it("rejects an invalid actor", () => {
    expect(() =>
      audit.record({ actor: "admin", action: "x", targetType: "y", outcome: "success" }),
    ).toThrow();
  });

  it("lists newest first with cursor pagination", () => {
    for (let i = 0; i < 5; i++) {
      audit.record({ actor: "user", action: `a${i}`, targetType: "t", outcome: "success" });
    }
    const first = audit.list({ limit: 2 });
    expect(first.items.map((e) => e.action)).toEqual(["a4", "a3"]);
    const second = audit.list({ limit: 2, cursor: first.nextCursor! });
    expect(second.items.map((e) => e.action)).toEqual(["a2", "a1"]);
    const third = audit.list({ limit: 2, cursor: second.nextCursor! });
    expect(third.items.map((e) => e.action)).toEqual(["a0"]);
    expect(third.nextCursor).toBeNull();
  });

  it("exposes no update or delete API (append-only)", () => {
    const methods = Object.getOwnPropertyNames(AuditService.prototype);
    expect(methods.filter((m) => /update|delete|remove|clear/i.test(m))).toEqual([]);
  });
});
