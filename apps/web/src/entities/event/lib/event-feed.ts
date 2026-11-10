import { type InfiniteData } from "@tanstack/react-query";

import { type EventPage, type UbulieraEvent } from "../model/types";

export type EventFeedData = InfiniteData<EventPage, unknown>;

/**
 * Put live events (oldest first, as delivered) at the head of a newest-first feed, skipping ids
 * already present. Returns `old` untouched when nothing is new or the feed was never fetched.
 */
export function prependEvents<T extends EventFeedData>(
  old: T | undefined,
  events: UbulieraEvent[],
): T | undefined {
  const first = old?.pages[0];
  if (!old || !first) return old;
  const known = new Set(old.pages.flatMap((p) => p.items.map((e) => e.id)));
  const fresh = events.filter((e) => !known.has(e.id)).reverse();
  if (fresh.length === 0) return old;
  return {
    ...old,
    pages: [{ ...first, items: [...fresh, ...first.items] }, ...old.pages.slice(1)],
  };
}

/** Flatten a feed to one newest-first list. */
export function flattenFeed(data: EventFeedData | undefined): UbulieraEvent[] {
  return data?.pages.flatMap((p) => p.items) ?? [];
}
