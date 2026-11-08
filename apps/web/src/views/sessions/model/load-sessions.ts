import { type QueryClient } from "@tanstack/react-query";

import { sessionListQuery } from "@/entities/session";

export function loadSessions(qc: QueryClient) {
  return qc.ensureQueryData(sessionListQuery());
}
