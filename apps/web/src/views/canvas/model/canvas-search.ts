import { type QueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { agentListQuery, MAX_AGENTS } from "@/entities/agent";
import { sessionListQuery } from "@/entities/session";

/** /canvas?sessionId=… — invalid values are dropped, never thrown. */
export const canvasSearchSchema = z.object({
  sessionId: z
    .preprocess(
      (v) => (typeof v === "number" ? String(v) : v),
      z.string().min(1).max(128).optional(),
    )
    .catch(undefined),
});
export type CanvasSearch = z.infer<typeof canvasSearchSchema>;

export const canvasAgentFilters = (sessionId: string | undefined) =>
  sessionId ? { sessionId, limit: MAX_AGENTS } : { limit: MAX_AGENTS };

export function loadCanvas(qc: QueryClient, sessionId: string | undefined) {
  return Promise.all([
    qc.ensureQueryData(agentListQuery(canvasAgentFilters(sessionId))),
    qc.ensureQueryData(sessionListQuery()),
  ]);
}
