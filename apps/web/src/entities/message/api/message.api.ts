import { http } from "@/shared/api";

import { MESSAGE_PAGE_SIZE } from "./query-keys";
import { type MessageFilters, type MessageList } from "../model/types";

type Opts = { signal?: AbortSignal };

function toParams(f: MessageFilters): Record<string, string | number> {
  const params: Record<string, string | number> = { limit: MESSAGE_PAGE_SIZE };
  if (f.executionId) params.executionId = f.executionId;
  if (f.taskId) params.taskId = f.taskId;
  if (f.type) params.type = f.type;
  return params;
}

export const messageApi = {
  /** GET /messages — newest first */
  list: (filters: MessageFilters = {}, opts: Opts = {}) =>
    http.get<MessageList>("/messages", { params: toParams(filters), ...opts }).then((r) => r.data),
};
