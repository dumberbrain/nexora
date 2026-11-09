import { useQuery } from "@tanstack/react-query";

import { commitSubject, githubCommitsQuery, shortSha, type RepoCoords } from "@/entities/github";
import { ErrorState, LoadingState } from "@/shared/ui/state";

import { Panel } from "./panel";

interface CommitsPanelProps {
  repo: RepoCoords;
  branch: string | undefined;
}

/** Recent commits (subject line only) of the default or the picked branch. */
export function CommitsPanel({ repo, branch }: CommitsPanelProps) {
  const commits = useQuery(githubCommitsQuery(repo, branch ? { branch } : {}));
  return (
    <Panel
      title={branch ? `Commits on ${branch}` : "Commits"}
      localGit={commits.data?.source === "local_git"}
    >
      {commits.isPending ? <LoadingState label="Loading commits" rows={4} /> : null}
      {commits.isError ? (
        <ErrorState
          title="Commits unavailable"
          error={commits.error}
          onRetry={() => void commits.refetch()}
        />
      ) : null}
      {commits.data?.items.length === 0 ? (
        <p className="font-mono text-xs text-muted-foreground">No commits</p>
      ) : null}
      {commits.data && commits.data.items.length > 0 ? (
        <ul aria-label="Commits" className="flex flex-col divide-y divide-border">
          {commits.data.items.map((c) => (
            <li key={c.sha} className="flex flex-col gap-0.5 py-1.5">
              <span className="text-sm break-words text-foreground">
                {commitSubject(c.message)}
              </span>
              <span className="flex flex-wrap gap-x-2 font-mono text-[11px] text-muted-foreground">
                {c.url ? (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="hover:text-phosphor"
                  >
                    {shortSha(c.sha)}
                  </a>
                ) : (
                  <code>{shortSha(c.sha)}</code>
                )}
                {c.author ? <span>{c.author}</span> : null}
                {c.date ? <time dateTime={c.date}>{c.date.slice(0, 10)}</time> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}
