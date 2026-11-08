import { type Session } from "@nexora/contracts";

import { type SessionRepository } from "./session.repository";
import { type Logger } from "../../lib/logger";
import { type EventBus, type EventInput } from "../event-manager";
import { type SessionHandle } from "../runtime-manager/runtime-adapter";

export interface LivenessDeps {
  bus: EventBus;
  sessions: Pick<SessionRepository, "get" | "update">;
  events: { append(e: EventInput): unknown };
  logger?: Logger;
  /** injectable clock (tests use vi fake timers, which also fake Date.now) */
  now?: () => number;
}

export interface WatchOptions {
  handle: Pick<SessionHandle, "interrupt" | "stop">;
  /** from the runtime's capability profile */
  canInterrupt: boolean;
  idleTimeoutMs: number;
  turnTimeoutMs: number;
  executionId: string | null;
  taskId: string | null;
  /** the turn exceeded turnTimeoutMs and was already interrupted/stopped */
  onTurnTimeout?: (info: { sessionId: string; taskId: string | null }) => void;
}

interface Watched {
  opts: WatchOptions;
  inTurn: boolean;
  waiting: boolean;
  unresponsive: boolean;
  idleTimer: NodeJS.Timeout | undefined;
  turnTimer: NodeJS.Timeout | undefined;
  /** remaining turn budget while the timer is suspended (approval wait) */
  turnRemainingMs: number;
  turnArmedAt: number;
}

/**
 * Liveness monitor for managed sessions (T096). During a turn, an idle timer is reset by every
 * event of the session; when it fires the session becomes `unresponsive` and an `error` event is
 * recorded. A turn timer bounds a whole turn: on expiry the session is interrupted (or stopped
 * when the runtime cannot interrupt) and `onTurnTimeout` is called. Both timers are suspended while
 * the session waits for a human approval — approvals never resolve by timeout (FR-033).
 */
export class LivenessMonitor {
  private readonly watched = new Map<string, Watched>();
  private readonly off: () => void;
  private readonly now: () => number;
  /** true while appending our own error event (it must not count as activity) */
  private selfEmitting = false;

  constructor(private readonly deps: LivenessDeps) {
    this.now = deps.now ?? Date.now;
    this.off = deps.bus.onEvent((e) => {
      if (this.selfEmitting || !e.sessionId) return;
      this.activity(e.sessionId);
    });
  }

  watch(sessionId: string, opts: WatchOptions): void {
    this.unwatch(sessionId);
    this.watched.set(sessionId, {
      opts,
      inTurn: false,
      waiting: false,
      unresponsive: false,
      idleTimer: undefined,
      turnTimer: undefined,
      turnRemainingMs: opts.turnTimeoutMs,
      turnArmedAt: 0,
    });
  }

  unwatch(sessionId: string): void {
    const w = this.watched.get(sessionId);
    if (!w) return;
    this.clearTimers(w);
    this.watched.delete(sessionId);
  }

  turnStarted(sessionId: string): void {
    const w = this.watched.get(sessionId);
    if (!w) return;
    this.clearTimers(w);
    w.inTurn = true;
    w.turnRemainingMs = w.opts.turnTimeoutMs;
    this.arm(sessionId, w);
  }

  turnEnded(sessionId: string): void {
    const w = this.watched.get(sessionId);
    if (!w) return;
    this.clearTimers(w);
    w.inTurn = false;
  }

  /** Suspend (true) or resume (false) both timers around a pending human approval. */
  setWaiting(sessionId: string, waiting: boolean): void {
    const w = this.watched.get(sessionId);
    if (!w || w.waiting === waiting) return;
    if (waiting) {
      if (w.turnTimer) w.turnRemainingMs -= this.now() - w.turnArmedAt;
      this.clearTimers(w);
      w.waiting = true;
    } else {
      w.waiting = false;
      this.arm(sessionId, w);
    }
  }

  close(): void {
    this.off();
    for (const w of this.watched.values()) this.clearTimers(w);
    this.watched.clear();
  }

  private activity(sessionId: string): void {
    const w = this.watched.get(sessionId);
    if (!w) return;
    if (w.unresponsive) {
      w.unresponsive = false;
      const current = this.deps.sessions.get(sessionId);
      if (current?.status === "unresponsive") this.patch(sessionId, { status: "running" });
    }
    if (!w.inTurn || w.waiting) return;
    if (w.idleTimer) clearTimeout(w.idleTimer);
    w.idleTimer = setTimeout(() => this.onIdle(sessionId), w.opts.idleTimeoutMs);
  }

  private arm(sessionId: string, w: Watched): void {
    if (!w.inTurn || w.waiting) return;
    w.idleTimer = setTimeout(() => this.onIdle(sessionId), w.opts.idleTimeoutMs);
    w.turnArmedAt = this.now();
    w.turnTimer = setTimeout(
      () => void this.onTurnTimeout(sessionId),
      Math.max(0, w.turnRemainingMs),
    );
  }

  private clearTimers(w: Watched): void {
    if (w.idleTimer) clearTimeout(w.idleTimer);
    if (w.turnTimer) clearTimeout(w.turnTimer);
    w.idleTimer = undefined;
    w.turnTimer = undefined;
  }

  private onIdle(sessionId: string): void {
    const w = this.watched.get(sessionId);
    if (!w) return;
    w.idleTimer = undefined;
    w.unresponsive = true;
    this.patch(sessionId, { status: "unresponsive" });
    const minutes = Math.round(w.opts.idleTimeoutMs / 60_000);
    this.selfEmitting = true;
    try {
      this.deps.events.append({
        type: "error",
        source: "orchestrator",
        reliability: "derived",
        severity: "warn",
        executionId: w.opts.executionId,
        taskId: w.opts.taskId,
        sessionId,
        summary: `Session unresponsive: no activity for ${minutes} min`,
        payload: { reason: "idle_timeout", idleTimeoutMs: w.opts.idleTimeoutMs },
      });
    } finally {
      this.selfEmitting = false;
    }
  }

  private async onTurnTimeout(sessionId: string): Promise<void> {
    const w = this.watched.get(sessionId);
    if (!w) return;
    this.clearTimers(w);
    w.inTurn = false;
    const { handle, canInterrupt, taskId } = w.opts;
    try {
      if (canInterrupt) await handle.interrupt();
      else await handle.stop();
    } catch (err) {
      this.deps.logger?.warn({ err, sessionId }, "turn timeout: interrupt failed, stopping");
      try {
        await handle.stop();
      } catch (stopErr) {
        this.deps.logger?.error({ err: stopErr, sessionId }, "turn timeout: stop failed");
      }
    }
    w.opts.onTurnTimeout?.({ sessionId, taskId });
  }

  private patch(sessionId: string, patch: Partial<Session>): void {
    this.deps.sessions.update(sessionId, patch);
    this.deps.bus.publishEntityChanged({ kind: "session", id: sessionId, patch: { ...patch } });
  }
}
