import { monotonicFactory } from "ulid";

const next = monotonicFactory();

/**
 * Monotonic ULID: strictly increasing even within the same millisecond, so event ids work as
 * an ordered replay cursor (contracts/socket-events.md).
 */
export function newId(now: number = Date.now()): string {
  return next(now);
}
