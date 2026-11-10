import { type Stats } from "@ubuliera/contracts";
import { count, desc, eq, inArray, type SQL } from "drizzle-orm";
import { type SQLiteTable } from "drizzle-orm/sqlite-core";

import { type Db } from "../../db/client";
import {
  agents,
  approvalRequests,
  executions,
  sessions,
  tasks,
  workflowRuns,
} from "../../db/schema";
import { type Logger } from "../../lib/logger";

function countWhere(db: Db, table: SQLiteTable, where: SQL): number {
  return db.select({ n: count() }).from(table).where(where).get()?.n ?? 0;
}

/** Overview counters (FR-024) straight from the database. */
export function computeStats(db: Db): Stats {
  const running = db
    .select({ mode: executions.mode })
    .from(executions)
    .where(eq(executions.status, "running"))
    .orderBy(desc(executions.startedAt))
    .limit(1)
    .get();
  return {
    activeSessions: countWhere(
      db,
      sessions,
      inArray(sessions.status, ["running", "idle", "waiting_for_approval"]),
    ),
    activeAgents: countWhere(db, agents, inArray(agents.status, ["running", "spawning"])),
    idleAgents: countWhere(db, agents, inArray(agents.status, ["idle", "waiting"])),
    completedTasks: countWhere(db, tasks, eq(tasks.status, "completed")),
    failedTasks: countWhere(db, tasks, eq(tasks.status, "failed")),
    pendingApprovals: countWhere(db, approvalRequests, eq(approvalRequests.status, "pending")),
    runningWorkflows: countWhere(db, workflowRuns, eq(workflowRuns.status, "running")),
    currentMode: running?.mode ?? null,
  };
}

export interface StatsServiceOptions {
  /** minimum gap between two publications; default 500 ms (≤ 2/s) */
  intervalMs?: number;
  now?: () => number;
  logger?: Logger;
}

/** Publishes Stats with a trailing throttle: bursts of changes cause at most 2 emissions/s. */
export class StatsService {
  private timer: NodeJS.Timeout | undefined;
  private lastPublished = Number.NEGATIVE_INFINITY;
  private readonly intervalMs: number;
  private readonly now: () => number;

  constructor(
    private readonly db: Db,
    private readonly publish: (stats: Stats) => void,
    private readonly opts: StatsServiceOptions = {},
  ) {
    this.intervalMs = opts.intervalMs ?? 500;
    this.now = opts.now ?? Date.now;
  }

  current(): Stats {
    return computeStats(this.db);
  }

  /** Request a publication; coalesced with any already scheduled one. */
  schedule(): void {
    if (this.timer) return;
    const wait = Math.max(0, this.lastPublished + this.intervalMs - this.now());
    this.timer = setTimeout(() => this.emit(), wait);
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private emit(): void {
    this.timer = undefined;
    this.lastPublished = this.now();
    try {
      this.publish(this.current());
    } catch (err) {
      this.opts.logger?.error({ err }, "stats publication failed");
    }
  }
}
