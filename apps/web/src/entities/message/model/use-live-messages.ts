import { useQueryClient } from "@tanstack/react-query";

import { useLiveSubscription } from "@/shared/socket/use-live-subscription";

import { type Message, type MessageFilters } from "./types";
import { messageListQuery } from "../api/message.queries";
import { matchesMessageFilters, messageFromEvent, prependMessages } from "../lib/message-lib";

/**
 * Keep the cached feed for `filters` live from `message.sent` events (execution room when
 * filtered by execution, else global). Events that are not full Messages trigger a refetch.
 */
export function useLiveMessages(filters: MessageFilters): void {
  const qc = useQueryClient();
  const { queryKey } = messageListQuery(filters);
  useLiveSubscription({
    ...(filters.executionId
      ? { scope: "execution" as const, id: filters.executionId }
      : { scope: "global" as const }),
    onEvents: (events) => {
      const sent = events.filter((e) => e.type === "message.sent");
      if (sent.length === 0) return;
      const messages = sent.map(messageFromEvent);
      if (messages.some((m) => m === null)) {
        void qc.invalidateQueries({ queryKey });
        return;
      }
      const fresh = (messages as Message[]).filter((m) => matchesMessageFilters(m, filters));
      if (fresh.length > 0) qc.setQueryData(queryKey, (old) => prependMessages(old, fresh));
    },
    onGap: () => void qc.invalidateQueries({ queryKey }),
  });
}
