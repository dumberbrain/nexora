import { type NexoraEvent } from "@nexora/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeDb, openDb, type Db } from "../../../src/db/client";
import { executions, projects } from "../../../src/db/schema";
import { REDACTED } from "../../../src/lib/redactor";
import { EventBus } from "../../../src/modules/event-manager/event-bus";
import { type EventInput, EventStore } from "../../../src/modules/event-manager/event-store";

let db: Db;
let bus: EventBus;
let store: EventStore;
let clock = 1_700_000_000_000;

const ev = (over: Partial<EventInput> = {}): EventInput => ({
  type: "tool.invoked",
  source: "hook",
  reliability: "authoritative",
  severity: "info",
  sessionId: "s1",
  summary: "Read src/main.ts",
  payload: { tool: "Read" },
  ...over,
});

const count = () =>
  (db.$client.prepare("select count(*) as n from events").get() as { n: number }).n;

beforeEach(() => {
  vi.useFakeTimers();
  db = openDb({ dataDir: ":memory:" });
  bus = new EventBus();
  store = new EventStore(db, bus, { batchMs: 100, now: () => clock++ });
});
afterEach(() => {
  store.close();
  closeDb(db);
  vi.useRealTimers();
});

describe("EventStore.append", () => {
  it("returns the event immediately and publishes it on the bus", () => {
    const seen: NexoraEvent[] = [];
    bus.onEvent((e) => seen.push(e));
    const e = store.append(ev());
    expect(e.id).toHaveLength(26);
    expect(seen).toEqual([e]);
  });

  it("batches inserts every 100 ms", () => {
    store.append(ev());
    store.append(ev());
    store.append(ev());
    expect(count()).toBe(0);
    vi.advanceTimersByTime(99);
    expect(count()).toBe(0);
    vi.advanceTimersByTime(1);
    expect(count()).toBe(3);
  });

  it("redacts summary and payload before storing and publishing", () => {
    const e = store.append(
      ev({
        summary: "curl -H 'Authorization: Bearer abcdefgh123'",
        payload: { password: "hunter2", nested: { token: "t0k3n" } },
      }),
    );
    store.flush();
    const raw = JSON.stringify(db.$client.prepare("select summary, payload from events").all());
    for (const secret of ["abcdefgh123", "hunter2", "t0k3n"]) {
      expect(raw).not.toContain(secret);
      expect(JSON.stringify(e)).not.toContain(secret);
    }
    expect(raw).toContain(REDACTED);
  });

  it("caps summary at 500 chars", () => {
    const e = store.append(ev({ summary: "x".repeat(2000) }));
    expect(e.summary.length).toBeLessThanOrEqual(500);
  });

  it("truncates payloads over 32 KB and flags them", () => {
    const e = store.append(ev({ payload: { blob: "y".repeat(40 * 1024) } }));
    expect(e.truncated).toBe(true);
    expect(JSON.stringify(e.payload).length).toBeLessThan(32 * 1024);
    const small = store.append(ev({ payload: { ok: 1 } }));
    expect(small.truncated).toBe(false);
  });
});

describe("EventStore queries", () => {
  beforeEach(() => {
    db.insert(projects)
      .values({
        id: "01JC00000000000000000000P1",
        name: "p",
        rootPath: "/p",
        detectedStack: { languages: [], frameworks: [], testRunners: [] },
        instructionFiles: [],
        createdAt: 1,
      })
      .run();
    db.insert(executions)
      .values({
        id: "01JC00000000000000000000E1",
        projectId: "01JC00000000000000000000P1",
        prompt: "x",
        mode: "subagents",
        config: {} as never,
        status: "running",
        createdAt: 1,
      })
      .run();

    store.append(ev({ sessionId: "s1", agentId: "a1", summary: "edited router file" }));
    store.append(ev({ sessionId: "s1", type: "error", severity: "error", summary: "boom" }));
    store.append(
      ev({ sessionId: "s2", executionId: "01JC00000000000000000000E1", summary: "ran tests" }),
    );
    store.append(ev({ sessionId: "s2", type: "file.modified", reliability: "derived" }));
  });

  it("flushes pending events before querying", () => {
    expect(count()).toBe(0);
    expect(store.list({ limit: 50 }).items).toHaveLength(4);
  });

  it("lists newest first with cursor pagination", () => {
    const p1 = store.list({ limit: 3 });
    expect(p1.items).toHaveLength(3);
    expect(p1.nextCursor).not.toBeNull();
    const p2 = store.list({ limit: 3, cursor: p1.nextCursor! });
    expect(p2.items).toHaveLength(1);
    expect(p2.nextCursor).toBeNull();
    const ids = [...p1.items, ...p2.items].map((e) => e.id);
    expect(ids).toEqual([...ids].sort().reverse());
  });

  it("filters by session, agent, execution, type, severity, time and mode", () => {
    expect(store.list({ limit: 50, sessionId: "s1" }).items).toHaveLength(2);
    expect(store.list({ limit: 50, agentId: "a1" }).items).toHaveLength(1);
    expect(store.list({ limit: 50, executionId: "01JC00000000000000000000E1" }).items).toHaveLength(
      1,
    );
    expect(store.list({ limit: 50, type: ["error", "file.modified"] }).items).toHaveLength(2);
    expect(store.list({ limit: 50, severity: ["error"] }).items).toHaveLength(1);
    expect(store.list({ limit: 50, mode: "subagents" }).items).toHaveLength(1);
    const all = store.list({ limit: 50 }).items;
    const middle = all[1]!.ts;
    expect(store.list({ limit: 50, from: middle }).items.every((e) => e.ts >= middle)).toBe(true);
    expect(store.list({ limit: 50, to: middle }).items.every((e) => e.ts <= middle)).toBe(true);
  });

  it("searches summaries with full-text search, safely quoting user input", () => {
    expect(store.list({ limit: 50, q: "router" }).items.map((e) => e.summary)).toEqual([
      "edited router file",
    ]);
    expect(store.list({ limit: 50, q: 'tests" OR "boom' }).items).toHaveLength(0);
    expect(store.list({ limit: 50, q: "NEAR(" }).items).toHaveLength(0);
  });

  it("returns events after a cursor in ascending order for replay", () => {
    const all = store.list({ limit: 50 }).items.reverse();
    const after = store.since({ afterId: all[0]!.id }, 10);
    expect(after.map((e) => e.id)).toEqual(all.slice(1).map((e) => e.id));
    expect(store.since({ afterId: all[0]!.id, sessionId: "s2" }, 10)).toHaveLength(2);
    expect(store.since({}, 2)).toHaveLength(2);
  });
});
