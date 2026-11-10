import { type QueryClient } from "@tanstack/react-query";
import { UlidSchema } from "@ubuliera/contracts";
import { z } from "zod";

import { executionListQuery } from "@/entities/execution";
import { projectListQuery } from "@/entities/project";
import { taskBoardQuery, type TaskBoardFilters } from "@/entities/task";

/** /tasks search params = board filters; invalid values are dropped, not fatal. */
export const tasksSearchSchema = z.object({
  executionId: UlidSchema.optional().catch(undefined),
  projectId: UlidSchema.optional().catch(undefined),
});

/** Drop keys whose value is undefined so the loader key matches the view's key. */
export function cleanBoardFilters(search: Record<string, unknown>): TaskBoardFilters {
  return Object.fromEntries(Object.entries(search).filter(([, v]) => v !== undefined));
}

/** Prefetch the board and its filter options in parallel (errors show in the view). */
export function loadTasks(qc: QueryClient, filters: TaskBoardFilters) {
  return Promise.all([
    qc.prefetchQuery(taskBoardQuery(filters)),
    qc.prefetchQuery(executionListQuery()),
    qc.prefetchQuery(projectListQuery()),
  ]);
}
