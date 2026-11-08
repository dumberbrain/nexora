import { createFileRoute } from "@tanstack/react-router";

import { AgentView, loadAgent } from "@/views/agent";

export const Route = createFileRoute("/agents/$agentId")({
  loader: ({ context, params }) => loadAgent(context.queryClient, params.agentId),
  component: function AgentRoute() {
    const { agentId } = Route.useParams();
    const sessionId = Route.useLoaderData();
    const navigate = Route.useNavigate();
    return (
      <AgentView
        agentId={agentId}
        sessionId={sessionId}
        onClose={() => void navigate({ to: "/canvas", search: { sessionId } })}
      />
    );
  },
});
