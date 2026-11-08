import { createFileRoute } from "@tanstack/react-router";

import { loadSession, SessionView } from "@/views/session";

export const Route = createFileRoute("/sessions/$sessionId")({
  loader: ({ context, params }) => loadSession(context.queryClient, params.sessionId),
  component: function SessionRoute() {
    const { sessionId } = Route.useParams();
    return <SessionView key={sessionId} sessionId={sessionId} />;
  },
});
