import { http } from "@/shared/api";

import { toEventParams } from "../lib/event-params";
import { type EventFilters, type EventPage } from "../model/types";

type Opts = { signal?: AbortSignal };

export type EventListParams = EventFilters & { cursor?: string | null; limit?: number };

export const eventApi = {
  /** newest first; `nextCursor` pages towards older events */
  list: ({ cursor, limit, ...filters }: EventListParams, opts: Opts = {}) =>
    http
      .get<EventPage>("/events", {
        params: {
          ...toEventParams(filters),
          ...(cursor ? { cursor } : {}),
          ...(limit ? { limit } : {}),
        },
        ...opts,
      })
      .then((r) => r.data),
};
