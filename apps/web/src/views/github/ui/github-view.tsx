import { useQuery } from "@tanstack/react-query";

import { githubStatusQuery } from "@/entities/github";
import { PageHeader } from "@/shared/ui/layout/page-header";
import { ErrorState, LoadingState } from "@/shared/ui/state";

import { RepoBrowser } from "./components/repo-browser";
import { SetupCard } from "./components/setup-card";
import { StatusCard } from "./components/status-card";
import { type GithubSearch } from "../model/github-search";

interface GithubViewProps {
  search: GithubSearch;
  onSearchChange: (next: GithubSearch) => void;
}

/**
 * GitHub page (US7): read-only branches, commits and pull requests of registered projects via
 * the server's `gh api` (local git fallback for branches/commits). Status comes first — repo
 * data is never requested unless gh is connected.
 */
export function GithubView({ search, onSearchChange }: GithubViewProps) {
  const status = useQuery(githubStatusQuery());
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        index="09"
        title="GitHub"
        description="Branches, commits and pull requests of your registered projects, read through the GitHub CLI. Nothing is written to GitHub."
      />
      {status.isPending ? <LoadingState label="Checking the GitHub CLI" rows={1} /> : null}
      {status.isError ? (
        <ErrorState
          title="GitHub status unavailable"
          error={status.error}
          onRetry={() => void status.refetch()}
        />
      ) : null}
      {status.data ? <StatusCard status={status.data} /> : null}
      {status.data && status.data.status !== "connected" ? (
        <SetupCard
          status={status.data}
          checking={status.isFetching}
          onCheckAgain={() => void status.refetch()}
        />
      ) : null}
      {status.data?.status === "connected" ? (
        <RepoBrowser search={search} onSearchChange={onSearchChange} />
      ) : null}
    </div>
  );
}
