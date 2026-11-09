import { useQuery } from "@tanstack/react-query";

import { githubBranchesQuery, shortSha, type RepoCoords } from "@/entities/github";
import { cn } from "@/shared/lib/cn";
import { ErrorState, LoadingState } from "@/shared/ui/state";

import { Panel } from "./panel";
import { Tag } from "./tag";

interface BranchesPanelProps {
  repo: RepoCoords;
  selected: string | undefined;
  onSelect: (branch: string) => void;
}

/** Branches of the repo; picking one scopes the commit list to it. */
export function BranchesPanel({ repo, selected, onSelect }: BranchesPanelProps) {
  const branches = useQuery(githubBranchesQuery(repo));
  return (
    <Panel title="Branches" localGit={branches.data?.source === "local_git"}>
      {branches.isPending ? <LoadingState label="Loading branches" rows={3} /> : null}
      {branches.isError ? (
        <ErrorState
          title="Branches unavailable"
          error={branches.error}
          onRetry={() => void branches.refetch()}
        />
      ) : null}
      {branches.data?.items.length === 0 ? (
        <p className="font-mono text-xs text-muted-foreground">No branches</p>
      ) : null}
      {branches.data && branches.data.items.length > 0 ? (
        <ul aria-label="Branches" className="flex flex-col gap-1">
          {branches.data.items.map((b) => (
            <li key={b.name} className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={selected === b.name}
                onClick={() => onSelect(b.name)}
                className={cn(
                  "font-mono text-sm text-foreground hover:text-phosphor focus-visible:text-phosphor focus-visible:outline-none",
                  selected === b.name && "text-phosphor",
                )}
              >
                {b.name}
              </button>
              {b.isDefault ? <Tag className="border-phosphor/60 text-phosphor">default</Tag> : null}
              {b.protected ? <Tag>protected</Tag> : null}
              <code className="text-[11px] text-muted-foreground">{shortSha(b.sha)}</code>
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}
