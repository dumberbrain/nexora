import {
  defaultGraph,
  type WorkflowDetail,
  type WorkflowVersion,
  type WorkflowVersionMeta,
} from "@/entities/workflow";
import { RunWorkflowDialog, SaveVersionButton, VersionPicker } from "@/features/edit-workflow";
import { useWorkflowDraft, WorkflowEditor } from "@/widgets/workflow-editor";

interface EditorBodyProps {
  workflow: WorkflowDetail;
  /** the version on screen; null = the definition has no version yet */
  version: WorkflowVersion | null;
  latest: number | null;
  versions: WorkflowVersionMeta[];
  onVersionChange: (version: number) => void;
  onSaved: (saved: WorkflowVersion) => void;
  onRunStarted: (executionId: string) => void;
}

/**
 * Editor + toolbar for one version. Keyed by version by the owner, so switching versions (or
 * saving a new one) starts a fresh draft. Only the latest version is editable.
 */
export function EditorBody(props: EditorBodyProps) {
  const { workflow, version, latest, versions, onVersionChange, onSaved, onRunStarted } = props;
  const draft = useWorkflowDraft(version?.graph ?? defaultGraph());
  const readOnly = version !== null && version.version !== latest;

  const toolbar = (
    <>
      {version && latest !== null && versions.length > 0 ? (
        <VersionPicker
          versions={versions}
          value={version.version}
          latest={latest}
          onChange={onVersionChange}
        />
      ) : null}
      {readOnly ? null : (
        <SaveVersionButton
          workflowId={workflow.id}
          graph={draft.graph}
          disabled={version !== null && !draft.dirty}
          onSaved={onSaved}
        />
      )}
      {version ? (
        <RunWorkflowDialog
          workflowId={workflow.id}
          workflowName={workflow.name}
          version={version.version}
          onStarted={onRunStarted}
        />
      ) : null}
      <p className="font-mono text-[11px] text-muted-foreground">
        {readOnly
          ? `v${version.version} is read-only — open the latest version to edit; it can still be run.`
          : draft.dirty
            ? "unsaved changes — saving creates a new version"
            : version
              ? `editing v${version.version}`
              : "no version yet — save to create version 1"}
      </p>
    </>
  );

  return <WorkflowEditor draft={draft} readOnly={readOnly} toolbar={toolbar} />;
}
