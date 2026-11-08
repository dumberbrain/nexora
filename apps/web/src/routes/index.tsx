import { createFileRoute } from "@tanstack/react-router";

import { EmptyState } from "@/shared/ui/state";

// The Overview view (live counters, FR-024) replaces this in US1 (T065).
export const Route = createFileRoute("/")({
  component: function OverviewRoute() {
    return (
      <EmptyState
        index="[01]"
        title="Overview"
        description="Live counters for sessions, agents, tasks and approvals arrive with User Story 1. The realtime link status is shown in the header."
      />
    );
  },
});
