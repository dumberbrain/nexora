import { useQuery } from "@tanstack/react-query";

import { githubPullsQuery, type RepoCoords } from "@/entities/github";
import { ErrorState, LoadingState } from "@/shared/ui/state";

import { Panel } from "./panel";
import { PullRow } from "./pull-row";

interface PullsPanelProps {
  repo: RepoCoords;
  openPull: number | undefined;
  onShowFiles: (number: number) => void;
}

/** Open pull requests with their aggregated review status. */
export function PullsPanel({ repo, openPull, onShowFiles }: PullsPanelProps) {
  const pulls = useQuery(githubPullsQuery(repo));
  return (
    <Panel title="Pull requests">
      {pulls.isPending ? <LoadingState label="Loading pull requests" rows={3} /> : null}
      {pulls.isError ? (
        <ErrorState
          title="Pull requests unavailable"
          error={pulls.error}
          onRetry={() => void pulls.refetch()}
        />
      ) : null}
      {pulls.data?.items.length === 0 ? (
        <p className="font-mono text-xs text-muted-foreground">No open pull requests</p>
      ) : null}
      {pulls.data && pulls.data.items.length > 0 ? (
        <ul aria-label="Pull requests" className="flex flex-col divide-y divide-border">
          {pulls.data.items.map((p) => (
            <PullRow
              key={p.number}
              pull={p}
              open={openPull === p.number}
              onShowFiles={() => onShowFiles(p.number)}
            />
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}
