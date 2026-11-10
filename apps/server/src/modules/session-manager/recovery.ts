import { type SessionStatus } from "@nexora/contracts";

import { type SessionRepository } from "./session.repository";
import { type Logger } from "../../lib/logger";
import { type EventBus } from "../event-manager/event-bus";

/** Statuses that claim a live process; after a restart they cannot be trusted any more. */
export const RECOVERABLE_STATUSES: readonly SessionStatus[] = [
  "starting",
  "running",
  "idle",
  "waiting_for_approval",
  "paused",
  "unresponsive",
];

export interface RecoveryDeps {
  sessions: Pick<SessionRepository, "listByStatus" | "update">;
  bus: Pick<EventBus, "publishEntityChanged">;
  /** true when this process still holds a handle for the session (runtime manager) */
  isLive?: (sessionId: string) => boolean;
  logger?: Logger;
}

/**
 * Restart recovery (T157, spec edge case "server restarts mid-execution"). Run once on boot:
 * every session that still claims to be alive but has no live handle in this process becomes
 * `unknown` — never shown as running. Rows and event history are untouched. An observed session
 * re-attaches by itself: its next hook event moves it out of `unknown` (see nextSessionStatus).
 */
export function recoverSessions(deps: RecoveryDeps): { marked: string[] } {
  const isLive = deps.isLive ?? (() => false);
  const marked: string[] = [];
  for (const s of deps.sessions.listByStatus(RECOVERABLE_STATUSES)) {
    if (isLive(s.id)) continue;
    deps.sessions.update(s.id, { status: "unknown" });
    deps.bus.publishEntityChanged({ kind: "session", id: s.id, patch: { status: "unknown" } });
    marked.push(s.id);
  }
  if (marked.length > 0) {
    deps.logger?.info({ count: marked.length }, "restart recovery: sessions marked unknown");
  }
  return { marked };
}
