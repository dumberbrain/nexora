import { createFileRoute } from "@tanstack/react-router";

import { cleanFilters, loadLogs, LogsView, logsSearchSchema } from "@/views/logs";

export const Route = createFileRoute("/logs")({
  validateSearch: logsSearchSchema,
  loaderDeps: ({ search }) => cleanFilters(search),
  loader: ({ context, deps }) => loadLogs(context.queryClient, deps),
  component: function LogsRoute() {
    const filters = cleanFilters(Route.useSearch());
    const navigate = Route.useNavigate();
    return (
      <LogsView filters={filters} onFiltersChange={(next) => void navigate({ search: next })} />
    );
  },
});
