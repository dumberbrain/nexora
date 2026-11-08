import { type SubscribeScope } from "@nexora/contracts";
import { useQueryClient } from "@tanstack/react-query";

import { useLiveSubscription } from "@/shared/socket/use-live-subscription";

import { type EventFilters, type NexoraEvent } from "./types";
import { eventFeedQuery } from "../api/event.queries";
import { prependEvents } from "../lib/event-feed";
import { matchesEventFilters } from "../lib/event-params";

/** Narrowest socket room that still covers the filters. */
function scopeOf(f: EventFilters): { scope: SubscribeScope; id?: string } {
  if (f.agentId) return { scope: "agent", id: f.agentId };
  if (f.sessionId) return { scope: "session", id: f.sessionId };
  if (f.executionId) return { scope: "execution", id: f.executionId };
  return { scope: "global" };
}

interface LiveEventFeedOptions {
  /** called with every matching live event batch (after the cache was updated) */
  onEvents?: (events: NexoraEvent[]) => void;
  enabled?: boolean;
}

/**
 * Keep the cached event feed for `filters` live: matching socket events are prepended to the
 * newest page; a replay gap refetches the feed from REST.
 */
export function useLiveEventFeed(filters: EventFilters, opts: LiveEventFeedOptions = {}): void {
  const qc = useQueryClient();
  const { queryKey } = eventFeedQuery(filters);
  const { scope, id } = scopeOf(filters);
  useLiveSubscription({
    scope,
    ...(id ? { id } : {}),
    enabled: opts.enabled ?? true,
    onEvents: (events) => {
      const fresh = events.filter((e) => matchesEventFilters(e, filters));
      if (fresh.length === 0) return;
      qc.setQueryData(queryKey, (old) => prependEvents(old, fresh));
      opts.onEvents?.(fresh);
    },
    onGap: () => void qc.invalidateQueries({ queryKey }),
  });
}
