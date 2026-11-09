import { createFileRoute } from "@tanstack/react-router";

import { cleanBoardFilters, loadTasks, TasksView, tasksSearchSchema } from "@/views/tasks";

export const Route = createFileRoute("/tasks")({
  validateSearch: tasksSearchSchema,
  loaderDeps: ({ search }) => cleanBoardFilters(search),
  loader: ({ context, deps }) => loadTasks(context.queryClient, deps),
  component: function TasksRoute() {
    const filters = cleanBoardFilters(Route.useSearch());
    const navigate = Route.useNavigate();
    return (
      <TasksView filters={filters} onFiltersChange={(next) => void navigate({ search: next })} />
    );
  },
});
