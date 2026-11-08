import {
  type EventQuery,
  type EventSource,
  type EventType,
  MAX_EVENT_PAYLOAD_BYTES,
  MAX_EVENT_SUMMARY,
  type NexoraEvent,
  type Page,
  type Reliability,
  type Severity,
} from "@nexora/contracts";
import { and, asc, desc, eq, gt, gte, inArray, lt, lte, sql, type SQL } from "drizzle-orm";

import { type EventBus } from "./event-bus";
import { type Db } from "../../db/client";
import { events } from "../../db/schema";
import { redact, redactString } from "../../lib/redactor";
import { newId } from "../../lib/ulid";

/** A normalised event before it gets an id, redaction and size limits. */
export interface EventInput {
  ts?: number;
  type: EventType;
  source: EventSource;
  reliability: Reliability;
  severity: Severity;
  executionId?: string | null;
  sessionId?: string | null;
  agentId?: string | null;
  taskId?: string | null;
  summary: string;
  payload?: unknown;
}

export interface ReplayScope {
  afterId?: string;
  executionId?: string;
  sessionId?: string;
  agentId?: string;
}

const PREVIEW_CHARS = 2048;

function capSummary(s: string): string {
  const clean = redactString(s).replace(/\s+/g, " ").trim();
  return clean.length > MAX_EVENT_SUMMARY ? `${clean.slice(0, MAX_EVENT_SUMMARY - 1)}…` : clean;
}

function capPayload(payload: unknown): { payload: unknown; truncated: boolean } {
  const safe = redact(payload ?? null);
  const json = JSON.stringify(safe) ?? "null";
  const bytes = Buffer.byteLength(json, "utf8");
  if (bytes <= MAX_EVENT_PAYLOAD_BYTES) return { payload: safe, truncated: false };
  return {
    payload: { preview: json.slice(0, PREVIEW_CHARS), originalBytes: bytes },
    truncated: true,
  };
}

/** Quote every token so user input can never use FTS5 operators (AND/OR/NEAR/column filters). */
function ftsQuery(q: string): string {
  return q
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '""')}"`)
    .join(" ");
}

type Row = typeof events.$inferSelect;
const toEvent = (r: Row): NexoraEvent => ({ ...r, payload: r.payload ?? null });

/**
 * Event persistence + publication. append() is synchronous for producers and publishes at once;
 * rows are written in one transaction per batch window. Every read flushes first so replay never
 * misses an event that was already published.
 */
export class EventStore {
  private buffer: NexoraEvent[] = [];
  private timer: NodeJS.Timeout | undefined;
  private readonly batchMs: number;
  private readonly now: () => number;

  constructor(
    private readonly db: Db,
    private readonly bus: EventBus,
    opts: { batchMs?: number; now?: () => number } = {},
  ) {
    this.batchMs = opts.batchMs ?? 100;
    this.now = opts.now ?? Date.now;
  }

  append(input: EventInput): NexoraEvent {
    const now = this.now();
    const { payload, truncated } = capPayload(input.payload);
    const event: NexoraEvent = {
      id: newId(now),
      ts: input.ts ?? now,
      type: input.type,
      source: input.source,
      reliability: input.reliability,
      severity: input.severity,
      executionId: input.executionId ?? null,
      sessionId: input.sessionId ?? null,
      agentId: input.agentId ?? null,
      taskId: input.taskId ?? null,
      summary: capSummary(input.summary),
      payload,
      truncated,
    };
    this.buffer.push(event);
    this.timer ??= setTimeout(() => this.flush(), this.batchMs);
    this.bus.publishEvent(event);
    return event;
  }

  /** Write buffered events in a single transaction. */
  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.buffer.length === 0) return;
    const batch = this.buffer;
    this.buffer = [];
    this.db.transaction((tx) => {
      for (const e of batch) tx.insert(events).values(e).run();
    });
  }

  /** Newest first, cursor = last seen id (Live Logs, GET /events). */
  list(q: Partial<EventQuery> & { limit: number }): Page<NexoraEvent> {
    this.flush();
    const where: SQL[] = [];
    if (q.cursor) where.push(lt(events.id, q.cursor));
    if (q.executionId) where.push(eq(events.executionId, q.executionId));
    if (q.sessionId) where.push(eq(events.sessionId, q.sessionId));
    if (q.agentId) where.push(eq(events.agentId, q.agentId));
    if (q.type?.length) where.push(inArray(events.type, q.type));
    if (q.severity?.length) where.push(inArray(events.severity, q.severity));
    if (q.from !== undefined) where.push(gte(events.ts, q.from));
    if (q.to !== undefined) where.push(lte(events.ts, q.to));
    if (q.mode) {
      where.push(sql`${events.executionId} in (select id from executions where mode = ${q.mode})`);
    }
    if (q.q) {
      where.push(
        sql`rowid in (select rowid from events_fts where events_fts match ${ftsQuery(q.q)})`,
      );
    }
    const rows = this.db
      .select()
      .from(events)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(events.id))
      .limit(q.limit + 1)
      .all();
    const items = rows.slice(0, q.limit).map(toEvent);
    return { items, nextCursor: rows.length > q.limit ? (items.at(-1)?.id ?? null) : null };
  }

  /** Oldest first after `afterId` — reconnect replay (contracts/socket-events.md). */
  since(scope: ReplayScope, limit: number): NexoraEvent[] {
    this.flush();
    const where: SQL[] = [];
    if (scope.afterId) where.push(gt(events.id, scope.afterId));
    if (scope.executionId) where.push(eq(events.executionId, scope.executionId));
    if (scope.sessionId) where.push(eq(events.sessionId, scope.sessionId));
    if (scope.agentId) where.push(eq(events.agentId, scope.agentId));
    return this.db
      .select()
      .from(events)
      .where(where.length ? and(...where) : undefined)
      .orderBy(asc(events.id))
      .limit(limit)
      .all()
      .map(toEvent);
  }

  close(): void {
    this.flush();
  }
}
