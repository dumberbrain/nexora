import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, type RenderOptions } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactElement } from "react";

import { TooltipProvider } from "@/shared/ui/tooltip";

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
}

interface RenderWithProvidersOptions extends Omit<RenderOptions, "wrapper"> {
  /** initial URL of the in-memory router */
  path?: string;
  queryClient?: QueryClient;
}

/**
 * Fresh QueryClient + tooltips + an in-memory router whose every path renders `ui`
 * (so <Link> works and navigation can be asserted via `router.state.location`).
 */
export function renderWithProviders(
  ui: ReactElement,
  { path = "/", queryClient, ...options }: RenderWithProvidersOptions = {},
) {
  const qc = queryClient ?? createTestQueryClient();
  const root = createRootRoute({ component: () => ui });
  const index = createRoute({ getParentRoute: () => root, path: "/" });
  const splat = createRoute({ getParentRoute: () => root, path: "$" });
  const router = createRouter({
    routeTree: root.addChildren([index, splat]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return {
    user: userEvent.setup(),
    queryClient: qc,
    router,
    ...render(
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>,
      options,
    ),
  };
}
