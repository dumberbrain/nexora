import { infiniteQueryOptions } from "@tanstack/react-query";

import { eventApi } from "./event.api";
import { EVENT_CACHE, EVENT_PAGE_SIZE, eventKeys } from "./query-keys";
import { type EventFilters } from "../model/types";

/** Newest-first event feed; `fetchNextPage` loads older events via the cursor. */
export const eventFeedQuery = (filters: EventFilters, limit = EVENT_PAGE_SIZE) =>
  infiniteQueryOptions({
    queryKey: eventKeys.feed(filters, limit),
    queryFn: ({ pageParam, signal }) =>
      eventApi.list({ ...filters, cursor: pageParam, limit }, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    ...EVENT_CACHE,
  });
