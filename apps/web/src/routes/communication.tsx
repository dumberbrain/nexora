import { createFileRoute } from "@tanstack/react-router";

import {
  cleanMessageFilters,
  CommunicationView,
  communicationSearchSchema,
  loadCommunication,
} from "@/views/communication";

export const Route = createFileRoute("/communication")({
  validateSearch: communicationSearchSchema,
  loaderDeps: ({ search }) => cleanMessageFilters(search),
  loader: ({ context, deps }) => loadCommunication(context.queryClient, deps),
  component: function CommunicationRoute() {
    const filters = cleanMessageFilters(Route.useSearch());
    const navigate = Route.useNavigate();
    return (
      <CommunicationView
        filters={filters}
        onFiltersChange={(next) => void navigate({ search: next })}
      />
    );
  },
});
