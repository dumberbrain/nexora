import { type QueryClient } from "@tanstack/react-query";

/** Context available to every route loader (`ensureQueryData` via the shared query client). */
export interface RouterContext {
  queryClient: QueryClient;
}
