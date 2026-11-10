import { type QueryClient } from "@tanstack/react-query";
import { MESSAGE_TYPES, TaskIdSchema, UlidSchema } from "@ubuliera/contracts";
import { z } from "zod";

import { messageListQuery, type MessageFilters } from "@/entities/message";

/** /communication search params = message filters; invalid values are dropped, not fatal. */
export const communicationSearchSchema = z.object({
  executionId: UlidSchema.optional().catch(undefined),
  taskId: TaskIdSchema.optional().catch(undefined),
  type: z.enum(MESSAGE_TYPES).optional().catch(undefined),
});

/** Drop keys whose value is undefined so the loader key matches the view's key. */
export function cleanMessageFilters(search: Record<string, unknown>): MessageFilters {
  return Object.fromEntries(Object.entries(search).filter(([, v]) => v !== undefined));
}

export function loadCommunication(qc: QueryClient, filters: MessageFilters) {
  return qc.prefetchQuery(messageListQuery(filters));
}
