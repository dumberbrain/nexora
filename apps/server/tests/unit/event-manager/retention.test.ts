import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeDb, openDb, type Db } from "../../../src/db/client";
import { EventBus } from "../../../src/modules/event-manager/event-bus";
import { type EventInput, EventStore } from "../../../src/modules/event-manager/event-store";
import {
  DEFAULT_RETENTION_DAYS,
  KEPT_EVENT_TYPES,
  purgeExpiredEvents,
  RetentionJob,
} from "../../../src/modules/event-manager/retention";
import { AuditService } from "../../../src/modules/permission-manager/audit.service";

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

let db: Db;
let store: EventStore;

const ev = (ageDays: number, over: Partial<EventInput> = {}): EventInput => ({
  ts: NOW - ageDays * DAY,
  type: "tool.invoked",
  source: "hook",
  reliability: "authoritative",
  severity: "info",
  sessionId: "s1",
  summary: "Read src/main.ts",
  ...over,
});

const count = (sql: string, ...params: unknown[]) =>
  (db.$client.prepare(sql).get(...params) as { n: number }).n;
const summaries = () =>
  (db.$client.prepare("select summary from events order by id").all() as { summary: string }[]).map(
    (r) => r.summary,
  );
const ftsHits = (word: string) =>
  count("select count(*) as n from events_fts where events_fts match ?", word);

beforeEach(() => {
  db = openDb({ dataDir: ":memory:" });
  store = new EventStore(db, new EventBus(), { batchMs: 1, now: () => NOW });
});
afterEach(() => {
  store.close();
  closeDb(db);
});

describe("purgeExpiredEvents", () => {
  it("defaults to 30 days", () => {
    expect(DEFAULT_RETENTION_DAYS).toBe(30);
    store.append(ev(31, { summary: "old" }));
    store.append(ev(29, { summary: "recent" }));
    store.flush();

    expect(purgeExpiredEvents(db, { now: NOW })).toBe(1);
    expect(summaries()).toEqual(["recent"]);
  });

  it("honours a configured retention", () => {
    store.append(ev(8, { summary: "eight" }));
    store.append(ev(6, { summary: "six" }));
    store.flush();

    expect(purgeExpiredEvents(db, { now: NOW, retentionDays: 7 })).toBe(1);
    expect(summaries()).toEqual(["six"]);
  });

  it("keeps error events and approval events however old", () => {
    expect(KEPT_EVENT_TYPES).toEqual(
      expect.arrayContaining(["error", "permission.requested", "permission.decided"]),
    );
    store.append(ev(90, { type: "error", severity: "error", summary: "boom" }));
    store.append(ev(90, { type: "permission.requested", summary: "asked" }));
    store.append(ev(90, { type: "permission.decided", summary: "decided" }));
    store.append(ev(90, { type: "task.failed", severity: "error", summary: "severe" }));
    store.append(ev(90, { summary: "gone" }));
    store.flush();

    expect(purgeExpiredEvents(db, { now: NOW })).toBe(1);
    expect(summaries()).toEqual(["boom", "asked", "decided", "severe"]);
  });

  it("never touches audit entries", () => {
    const audit = new AuditService(db, () => NOW - 400 * DAY);
    audit.record({
      actor: "user",
      action: "project.register",
      targetType: "project",
      outcome: "success",
    });
    store.append(ev(400));
    store.flush();

    purgeExpiredEvents(db, { now: NOW });

    expect(count("select count(*) as n from events")).toBe(0);
    expect(count("select count(*) as n from audit_entries")).toBe(1);
  });

  it("removes the matching FTS rows", () => {
    store.append(ev(45, { summary: "ancientmarker cleanup" }));
    store.append(ev(1, { summary: "freshmarker cleanup" }));
    store.flush();
    expect(ftsHits("ancientmarker")).toBe(1);

    purgeExpiredEvents(db, { now: NOW });

    expect(ftsHits("ancientmarker")).toBe(0);
    expect(ftsHits("freshmarker")).toBe(1);
    expect(ftsHits("cleanup")).toBe(1);
    expect(store.list({ q: "cleanup", limit: 10 }).items.map((e) => e.summary)).toEqual([
      "freshmarker cleanup",
    ]);
  });

  it("deletes in batches until nothing is left", () => {
    for (let i = 0; i < 25; i++) store.append(ev(40, { summary: `bulk ${i}` }));
    store.flush();

    expect(purgeExpiredEvents(db, { now: NOW, batchSize: 10 })).toBe(25);
    expect(count("select count(*) as n from events")).toBe(0);
  });
});

describe("RetentionJob", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("purges on start and then on every interval until closed", () => {
    let clock = NOW;
    const job = new RetentionJob({ db, retentionDays: 30, intervalMs: DAY, now: () => clock });
    store.append(ev(31, { summary: "a" }));
    store.flush();

    job.start();
    expect(count("select count(*) as n from events")).toBe(0);

    store.append(ev(29, { summary: "b" }));
    store.flush();
    clock += 2 * DAY;
    vi.advanceTimersByTime(DAY);
    expect(count("select count(*) as n from events")).toBe(0);

    job.close();
    store.append(ev(29, { summary: "c" }));
    store.flush();
    clock += 10 * DAY;
    vi.advanceTimersByTime(5 * DAY);
    expect(summaries()).toEqual(["c"]);
  });

  it("does not keep the process alive", () => {
    const job = new RetentionJob({ db, retentionDays: 30, intervalMs: DAY });
    job.start();
    expect(job.timerRef()?.hasRef()).toBe(false);
    job.close();
    expect(job.timerRef()).toBeUndefined();
  });

  it("logs and survives a failing purge", () => {
    const warn = vi.fn();
    const job = new RetentionJob({
      db,
      retentionDays: 30,
      intervalMs: DAY,
      logger: { warn, info: vi.fn(), debug: vi.fn() } as never,
    });
    closeDb(db);
    expect(() => job.start()).not.toThrow();
    expect(warn).toHaveBeenCalled();
    job.close();
    db = openDb({ dataDir: ":memory:" });
    store = new EventStore(db, new EventBus(), { batchMs: 1, now: () => NOW });
  });
});
