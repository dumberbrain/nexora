import { createFileRoute } from "@tanstack/react-router";

import {
  cleanIntegrationsSearch,
  IntegrationsView,
  integrationsSearchSchema,
  loadIntegrations,
} from "@/views/integrations";

export const Route = createFileRoute("/integrations")({
  validateSearch: integrationsSearchSchema,
  loaderDeps: ({ search }) => ({ projectId: search.projectId }),
  loader: ({ context, deps }) =>
    loadIntegrations(context.queryClient, cleanIntegrationsSearch(deps)),
  component: function IntegrationsRoute() {
    const search = cleanIntegrationsSearch(Route.useSearch());
    const navigate = Route.useNavigate();
    return (
      <IntegrationsView
        search={search}
        onSearchChange={(next) => void navigate({ search: next })}
      />
    );
  },
});
