import { type EventType } from "@ubuliera/contracts";

import { DEFAULT_RETENTION_DAYS } from "../../config/env";
import { type Db } from "../../db/client";
import { type Logger } from "../../lib/logger";

export { DEFAULT_RETENTION_DAYS };
/** Event types kept past retention, together with every audit entry (data-model: Event). */
export const KEPT_EVENT_TYPES: readonly EventType[] = [
  "error",
  "permission.requested",
  "permission.decided",
];
const DAY_MS = 86_400_000;
const DEFAULT_BATCH = 5_000;
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface PurgeOptions {
  now?: number;
  retentionDays?: number;
  /** rows per DELETE so a big backlog never holds the write lock for long */
  batchSize?: number;
}

/**
 * Delete events older than the retention window (T158). Error-type and error-severity events and
 * approval events stay; audit entries live in their own table and are never touched. FTS rows go
 * with their events through the `events_fts_ad` trigger. Returns the number of events deleted.
 */
export function purgeExpiredEvents(db: Db, opts: PurgeOptions = {}): number {
  const days = opts.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const cutoff = (opts.now ?? Date.now()) - days * DAY_MS;
  const batch = Math.max(1, opts.batchSize ?? DEFAULT_BATCH);
  const kept = KEPT_EVENT_TYPES.map(() => "?").join(", ");
  const stmt = db.$client.prepare(
    `delete from events where rowid in (
       select rowid from events
       where ts < ? and severity <> 'error' and type not in (${kept})
       limit ?
     )`,
  );
  let total = 0;
  for (;;) {
    const { changes } = stmt.run(cutoff, ...KEPT_EVENT_TYPES, batch);
    total += changes;
    if (changes < batch) return total;
  }
}

export interface RetentionJobDeps {
  db: Db;
  retentionDays: number;
  /** default 6 h */
  intervalMs?: number;
  now?: () => number;
  logger?: Pick<Logger, "info" | "warn">;
}

/** Runs the purge on start and then periodically; the timer never keeps the process alive. */
export class RetentionJob {
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly deps: RetentionJobDeps) {}

  start(): void {
    if (this.timer) return;
    this.run();
    this.timer = setInterval(() => this.run(), this.deps.intervalMs ?? DEFAULT_INTERVAL_MS);
    this.timer.unref();
  }

  /** One purge; failures are logged, never thrown (retention must not take the server down). */
  run(): number {
    try {
      const deleted = purgeExpiredEvents(this.deps.db, {
        retentionDays: this.deps.retentionDays,
        now: (this.deps.now ?? Date.now)(),
      });
      if (deleted > 0) {
        this.deps.logger?.info(
          { deleted, retentionDays: this.deps.retentionDays },
          "event retention",
        );
      }
      return deleted;
    } catch (err) {
      this.deps.logger?.warn({ err }, "event retention failed");
      return 0;
    }
  }

  /** test hook */
  timerRef(): NodeJS.Timeout | undefined {
    return this.timer;
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
