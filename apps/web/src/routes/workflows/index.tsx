import { createFileRoute } from "@tanstack/react-router";

import { loadWorkflows, WorkflowsView } from "@/views/workflows";

export const Route = createFileRoute("/workflows/")({
  loader: ({ context }) => loadWorkflows(context.queryClient),
  component: function WorkflowsRoute() {
    const navigate = Route.useNavigate();
    return (
      <WorkflowsView
        onCreated={(workflowId) =>
          void navigate({ to: "/workflows/$workflowId", params: { workflowId } })
        }
      />
    );
  },
});
