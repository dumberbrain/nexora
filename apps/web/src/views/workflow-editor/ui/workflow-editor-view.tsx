import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import {
  workflowDetailQuery,
  workflowVersionQuery,
  workflowVersionsQuery,
} from "@/entities/workflow";
import { PageHeader } from "@/shared/ui/layout/page-header";
import { ErrorState, LoadingState } from "@/shared/ui/state";

import { EditorBody } from "./components/editor-body";

interface WorkflowEditorViewProps {
  workflowId: string;
  /** ?version= — undefined = latest */
  version: number | undefined;
  onVersionChange: (version: number | undefined) => void;
  /** a run started — open its execution */
  onRunStarted: (executionId: string) => void;
}

/** One workflow: the editor on the latest version, or an older one read-only (still runnable). */
export function WorkflowEditorView(props: WorkflowEditorViewProps) {
  const { workflowId, version, onVersionChange, onRunStarted } = props;
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const detail = useQuery(workflowDetailQuery(workflowId));
  const versions = useQuery(workflowVersionsQuery(workflowId));
  const latest = detail.data?.latestVersion ?? null;
  const selected = version ?? latest;
  const pinned = selected !== null && selected !== latest;
  const older = useQuery({
    ...workflowVersionQuery(workflowId, selected ?? 1),
    enabled: pinned,
  });

  const current = pinned ? older : detail;
  const graphVersion = pinned ? older.data : detail.data?.latest;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        index="05"
        title={detail.data?.name ?? "Workflow"}
        description={detail.data?.description || null}
        actions={
          <Link to="/workflows" className="font-mono text-xs text-phosphor hover:underline">
            ← all workflows
          </Link>
        }
      />
      {savedVersion !== null ? (
        <p role="status" className="font-mono text-xs text-status-completed">
          Saved as version {savedVersion}
        </p>
      ) : null}
      {current.isPending ? <LoadingState label="Loading workflow" rows={4} /> : null}
      {current.isError ? (
        <ErrorState
          title="Workflow unavailable"
          error={current.error}
          onRetry={() => void current.refetch()}
        />
      ) : null}
      {detail.data && (graphVersion || latest === null) ? (
        <EditorBody
          key={`${workflowId}:${graphVersion?.version ?? 0}`}
          workflow={detail.data}
          version={graphVersion ?? null}
          latest={latest}
          versions={versions.data?.items ?? []}
          onVersionChange={(v) => onVersionChange(v === latest ? undefined : v)}
          onSaved={(saved) => {
            setSavedVersion(saved.version);
            onVersionChange(undefined);
          }}
          onRunStarted={onRunStarted}
        />
      ) : null}
    </div>
  );
}
