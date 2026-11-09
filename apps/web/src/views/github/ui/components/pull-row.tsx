import { useId } from "react";

import { REVIEW_STATUS_LABEL, REVIEW_STATUS_TONE, type GithubPull } from "@/entities/github";
import { Button } from "@/shared/ui/button";

import { Tag } from "./tag";

interface PullRowProps {
  pull: GithubPull;
  open: boolean;
  onShowFiles: () => void;
}

/** One PR: number + title, state, draft, review status, branches and a "files" toggle. */
export function PullRow({ pull: p, open, onShowFiles }: PullRowProps) {
  const id = useId();
  return (
    <li aria-labelledby={id} className="flex flex-col gap-1 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span id={id} className="text-sm text-foreground">
          {`#${p.number} ${p.title}`}
        </span>
        <Tag>{p.state}</Tag>
        {p.draft ? <Tag>draft</Tag> : null}
        <Tag className={REVIEW_STATUS_TONE[p.reviewStatus]}>
          {`review: ${REVIEW_STATUS_LABEL[p.reviewStatus]}`}
        </Tag>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
        <span>
          {p.head} → {p.base}
        </span>
        {p.author ? <span>{p.author}</span> : null}
        {p.url ? (
          <a href={p.url} target="_blank" rel="noreferrer noopener" className="hover:text-phosphor">
            open on GitHub
          </a>
        ) : null}
        <Button
          variant="outline"
          size="xs"
          aria-pressed={open}
          aria-label={`Show files of #${p.number}`}
          onClick={onShowFiles}
        >
          files
        </Button>
      </div>
    </li>
  );
}
