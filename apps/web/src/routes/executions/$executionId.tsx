import { createFileRoute } from "@tanstack/react-router";

import { ExecutionView, loadExecution } from "@/views/execution";

export const Route = createFileRoute("/executions/$executionId")({
  loader: ({ context, params }) => loadExecution(context.queryClient, params.executionId),
  component: function ExecutionRoute() {
    const { executionId } = Route.useParams();
    return <ExecutionView key={executionId} executionId={executionId} />;
  },
});
