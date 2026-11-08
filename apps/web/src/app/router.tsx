import { createRouter } from "@tanstack/react-router";

import { queryClient } from "@/shared/api";
import { EmptyState, ErrorState } from "@/shared/ui/state";

import { routeTree } from "../routeTree.gen";

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0, // TanStack Query owns freshness
  defaultErrorComponent: ({ error, reset }) => (
    <ErrorState title="This page failed to load" error={error} onRetry={reset} />
  ),
  defaultNotFoundComponent: () => (
    <EmptyState index="[404]" title="Not found" description="No page lives at this address." />
  ),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
