import { createFileRoute } from "@tanstack/react-router";

import { loadOverview, OverviewView } from "@/views/overview";

export const Route = createFileRoute("/")({
  loader: ({ context }) => loadOverview(context.queryClient),
  component: OverviewView,
});
