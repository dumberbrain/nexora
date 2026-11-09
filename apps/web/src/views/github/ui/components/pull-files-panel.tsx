import { useQuery } from "@tanstack/react-query";

import {
  githubPullFilesQuery,
  REVIEW_STATUS_LABEL,
  REVIEW_STATUS_TONE,
  type RepoCoords,
} from "@/entities/github";
import { ErrorState, LoadingState } from "@/shared/ui/state";

import { Panel } from "./panel";
import { Tag } from "./tag";

interface PullFilesPanelProps {
  repo: RepoCoords;
  number: number;
}

/** Changed files of one PR (+additions / -deletions) and its review status. */
export function PullFilesPanel({ repo, number }: PullFilesPanelProps) {
  const files = useQuery(githubPullFilesQuery(repo, number));
  const label = `Changed files of #${number}`;
  return (
    <Panel title={label}>
      {files.isPending ? <LoadingState label="Loading changed files" rows={3} /> : null}
      {files.isError ? (
        <ErrorState
          title="Changed files unavailable"
          error={files.error}
          onRetry={() => void files.refetch()}
        />
      ) : null}
      {files.data ? (
        <>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {files.data.pull.title}
            <Tag className={REVIEW_STATUS_TONE[files.data.pull.reviewStatus]}>
              {`review: ${REVIEW_STATUS_LABEL[files.data.pull.reviewStatus]}`}
            </Tag>
          </p>
          {files.data.files.length === 0 ? (
            <p className="font-mono text-xs text-muted-foreground">No changed files</p>
          ) : (
            <ul aria-label={label} className="flex flex-col gap-1 font-mono text-xs">
              {files.data.files.map((f) => (
                <li key={f.filename} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 break-all text-foreground">{f.filename}</span>
                  <Tag>{f.status}</Tag>
                  <span className="text-phosphor">{`+${f.additions}`}</span>
                  <span className="text-destructive">{`-${f.deletions}`}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </Panel>
  );
}
