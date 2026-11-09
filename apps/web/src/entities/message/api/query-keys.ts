import { type MessageFilters } from "../model/types";

/**
 * Cache policy — messages (Communication Center, FR-027)
 * owner:        US3 web
 * keys:         messageKeys.* (["messages", ...]); list(filters) holds one MessageList page
 * staleTime:    30 s   gcTime: 10 min  (the socket keeps open feeds current)
 * invalidation: send-message → lists()
 * realtime:     live `message.sent` events → prepend to list(filters); events without a
 *               Message payload (hook prompts) or a replay gap → invalidate list(filters)
 */
export const messageKeys = {
  all: ["messages"] as const,
  lists: () => [...messageKeys.all, "list"] as const,
  list: (filters: MessageFilters) => [...messageKeys.lists(), filters] as const,
};

export const MESSAGE_CACHE = { staleTime: 30_000, gcTime: 10 * 60_000 } as const;

/** One page of the feed; older history is in the Logs view. */
export const MESSAGE_PAGE_SIZE = 200;
