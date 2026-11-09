import { createFileRoute } from "@tanstack/react-router";

import {
  loadNewExecution,
  NewExecutionView,
  newExecutionSearchSchema,
} from "@/views/new-execution";

export const Route = createFileRoute("/executions/new")({
  validateSearch: newExecutionSearchSchema,
  loaderDeps: ({ search }) => ({ executionId: search.executionId }),
  loader: ({ context, deps }) => loadNewExecution(context.queryClient, deps.executionId),
  component: function NewExecutionRoute() {
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <NewExecutionView
        search={search}
        onSearchChange={(next) => void navigate({ search: next })}
        onLaunched={(executionId) =>
          void navigate({ to: "/executions/$executionId", params: { executionId } })
        }
      />
    );
  },
});
