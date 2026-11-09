import { createFileRoute } from "@tanstack/react-router";

import { cleanGithubSearch, GithubView, githubSearchSchema, loadGithub } from "@/views/github";

export const Route = createFileRoute("/github")({
  validateSearch: githubSearchSchema,
  loader: ({ context }) => loadGithub(context.queryClient),
  component: function GithubRoute() {
    const search = cleanGithubSearch(Route.useSearch());
    const navigate = Route.useNavigate();
    return (
      <GithubView search={search} onSearchChange={(next) => void navigate({ search: next })} />
    );
  },
});
