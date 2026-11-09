import { queryOptions } from "@tanstack/react-query";

import { messageApi } from "./message.api";
import { MESSAGE_CACHE, messageKeys } from "./query-keys";
import { type MessageFilters } from "../model/types";

export const messageListQuery = (filters: MessageFilters = {}) =>
  queryOptions({
    queryKey: messageKeys.list(filters),
    queryFn: ({ signal }) => messageApi.list(filters, { signal }),
    ...MESSAGE_CACHE,
  });
