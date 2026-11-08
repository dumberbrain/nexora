import { type ConnectionState } from "@/shared/socket/client";

import { type Session, type SessionStatus } from "../model/types";

/** An active session with no event for this long is flagged as possibly stale. */
export const STALE_AFTER_MS = 5 * 60_000;

const ACTIVE: ReadonlySet<SessionStatus> = new Set(["starting", "running", "waiting_for_approval"]);

/**
 * Why the row may not reflect reality right now — or null when it is fresh.
 * A dropped realtime link makes every row suspect; otherwise only active sessions that went quiet.
 */
export function sessionStaleReason(
  session: Pick<Session, "status" | "lastActivityAt">,
  now: number,
  connection: ConnectionState,
): string | null {
  if (connection !== "connected") return `realtime link ${connection} — may be out of date`;
  const quietMs = now - session.lastActivityAt;
  if (ACTIVE.has(session.status) && quietMs > STALE_AFTER_MS) {
    return `no events for ${Math.floor(quietMs / 60_000)} min while ${session.status.replaceAll("_", " ")}`;
  }
  return null;
}
