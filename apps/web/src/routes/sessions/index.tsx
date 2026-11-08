import { createFileRoute } from "@tanstack/react-router";

import { loadSessions, SessionsView } from "@/views/sessions";

export const Route = createFileRoute("/sessions/")({
  loader: ({ context }) => loadSessions(context.queryClient),
  component: SessionsView,
});
