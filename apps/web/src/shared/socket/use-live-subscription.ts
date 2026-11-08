import { type EventBatch, type NexoraEvent, type SubscribeScope } from "@nexora/contracts";
import { useEffect, useEffectEvent } from "react";

import { getLiveSocket, type LiveSocket } from "./client";

/** Per-subscription replay cursor, kept across remounts for the page lifetime. */
const cursors = new Map<string, string>();
const MAX_SEEN = 5000;

function matches(scope: SubscribeScope, id: string | undefined, e: NexoraEvent): boolean {
  if (scope === "global") return true;
  if (scope === "execution") return e.executionId === id;
  if (scope === "session") return e.sessionId === id;
  return e.agentId === id;
}

export interface LiveSubscriptionOptions {
  scope: SubscribeScope;
  id?: string;
  /** new (deduped) events, oldest first */
  onEvents: (events: NexoraEvent[]) => void;
  /** too many events missed while offline — refetch lists via REST */
  onGap?: () => void;
  enabled?: boolean;
  /** injectable for tests */
  socket?: LiveSocket;
}

/**
 * Subscribe to a live scope. Sends `sinceEventId` on every (re)connect so missed events are
 * replayed, and dedupes by id. useEffect is justified: it syncs with an external system (the
 * Socket.IO connection).
 */
export function useLiveSubscription(opts: LiveSubscriptionOptions): void {
  const { scope, id, enabled = true } = opts;
  const deliver = useEffectEvent((events: NexoraEvent[]) => opts.onEvents(events));
  const gap = useEffectEvent(() => opts.onGap?.());
  const injected = opts.socket;

  useEffect(() => {
    if (!enabled) return;
    const socket = injected ?? getLiveSocket();
    const key = `${scope}:${id ?? ""}`;
    const seen = new Set<string>();

    const remember = (eventId: string) => {
      seen.add(eventId);
      if (seen.size > MAX_SEEN) {
        const oldest = seen.values().next().value;
        if (oldest !== undefined) seen.delete(oldest);
      }
      const last = cursors.get(key);
      if (!last || eventId > last) cursors.set(key, eventId);
    };

    const subscribe = () => {
      const since = cursors.get(key);
      socket.emit(
        "subscribe",
        { scope, ...(id ? { id } : {}), ...(since ? { sinceEventId: since } : {}) },
        (ack) => {
          if (ack.gap) gap();
        },
      );
    };

    const onBatch = (batch: EventBatch) => {
      const fresh = batch.events.filter((e) => matches(scope, id, e) && !seen.has(e.id));
      if (fresh.length === 0) return;
      for (const e of fresh) remember(e.id);
      deliver(fresh);
    };

    socket.on("event", onBatch);
    socket.on("connect", subscribe);
    if (socket.connected) subscribe();

    return () => {
      socket.off("event", onBatch);
      socket.off("connect", subscribe);
      if (socket.connected) socket.emit("unsubscribe", { scope, ...(id ? { id } : {}) }, () => {});
    };
  }, [enabled, scope, id, injected]);
}

/** Test helper. */
export function __resetCursorsForTests(): void {
  cursors.clear();
}
