import { useQuery } from "@tanstack/react-query";
import { useId } from "react";

import { githubReposQuery, parseRepoSlug, repoSlug } from "@/entities/github";
import { EmptyState, ErrorState, LoadingState } from "@/shared/ui/state";

import { BranchesPanel } from "./branches-panel";
import { CommitsPanel } from "./commits-panel";
import { PullFilesPanel } from "./pull-files-panel";
import { PullsPanel } from "./pulls-panel";
import { type GithubSearch } from "../../model/github-search";

const SELECT =
  "h-8 max-w-80 rounded-sm border border-input bg-background px-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

interface RepoBrowserProps {
  search: GithubSearch;
  onSearchChange: (next: GithubSearch) => void;
}

/** Connected state: repo picker (registered projects' remotes) + branches, commits, PRs. */
export function RepoBrowser({ search, onSearchChange }: RepoBrowserProps) {
  const pickerId = useId();
  const repos = useQuery(githubReposQuery());
  const items = repos.data?.items ?? [];
  const slugs = items.map(repoSlug);
  const current = search.repo && slugs.includes(search.repo) ? search.repo : slugs[0];
  const coords = parseRepoSlug(current);

  if (repos.isPending) return <LoadingState label="Loading repositories" rows={2} />;
  if (repos.isError) {
    return (
      <ErrorState
        title="Repositories unavailable"
        error={repos.error}
        onRetry={() => void repos.refetch()}
      />
    );
  }
  if (!coords || !current) {
    return (
      <EmptyState
        title="No GitHub repositories"
        description="None of the registered projects has a GitHub remote. Register a project whose origin points at github.com."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor={pickerId} className="font-mono text-[10px] tracking-widest uppercase">
          Repository
        </label>
        <select
          id={pickerId}
          className={SELECT}
          value={current}
          onChange={(e) => onSearchChange({ repo: e.target.value })}
        >
          {slugs.map((slug) => (
            <option key={slug} value={slug}>
              {slug}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <BranchesPanel
          repo={coords}
          selected={search.branch}
          onSelect={(branch) => onSearchChange({ ...search, repo: current, branch })}
        />
        <CommitsPanel repo={coords} branch={search.branch} />
      </div>
      <PullsPanel
        repo={coords}
        openPull={search.pull}
        onShowFiles={(pull) => onSearchChange({ ...search, repo: current, pull })}
      />
      {search.pull ? <PullFilesPanel repo={coords} number={search.pull} /> : null}
    </div>
  );
}
