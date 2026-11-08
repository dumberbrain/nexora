import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { closeDb, openDb, pingDb, type Db } from "../../../src/db/client";
import { events } from "../../../src/db/schema";

let db: Db | undefined;
afterEach(() => {
  if (db) closeDb(db);
  db = undefined;
});

const event = (id: string, summary: string) => ({
  id,
  ts: 1,
  type: "tool.invoked" as const,
  source: "hook" as const,
  reliability: "authoritative" as const,
  severity: "info" as const,
  summary,
  payload: {},
  truncated: false,
});

describe("migrations", () => {
  it("create all tables and enable foreign keys", () => {
    db = openDb({ dataDir: ":memory:" });
    expect(pingDb(db)).toBe(true);
    const tables = db.$client
      .prepare("select name from sqlite_master where type in ('table') order by name")
      .all()
      .map((r) => (r as { name: string }).name);
    for (const t of [
      "projects",
      "executions",
      "tasks",
      "task_dependencies",
      "sessions",
      "agents",
      "events",
      "events_fts",
      "messages",
      "approval_requests",
      "workflow_definitions",
      "workflow_versions",
      "workflow_runs",
      "workflow_node_runs",
      "integrations",
      "audit_entries",
      "api_tokens",
      "settings",
    ]) {
      expect(tables).toContain(t);
    }
    expect(db.$client.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("keeps events_fts in sync on insert and delete", () => {
    db = openDb({ dataDir: ":memory:" });
    db.insert(events).values(event("01JC0000000000000000000001", "edited main.tsx router")).run();
    db.insert(events).values(event("01JC0000000000000000000002", "ran npm test")).run();

    const hits = () =>
      db!.$client
        .prepare("select count(*) as n from events_fts where events_fts match 'router'")
        .get() as { n: number };
    expect(hits().n).toBe(1);

    db.delete(events)
      .where(sql`${events.id} = '01JC0000000000000000000001'`)
      .run();
    expect(hits().n).toBe(0);
  });
});
