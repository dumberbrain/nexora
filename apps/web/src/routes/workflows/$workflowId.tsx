import { createFileRoute } from "@tanstack/react-router";

import {
  loadWorkflowEditor,
  workflowEditorSearchSchema,
  WorkflowEditorView,
} from "@/views/workflow-editor";

export const Route = createFileRoute("/workflows/$workflowId")({
  validateSearch: workflowEditorSearchSchema,
  loaderDeps: ({ search }) => ({ version: search.version }),
  loader: ({ context, params, deps }) =>
    loadWorkflowEditor(context.queryClient, params.workflowId, deps.version),
  component: function WorkflowEditorRoute() {
    const { workflowId } = Route.useParams();
    const { version } = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <WorkflowEditorView
        key={workflowId}
        workflowId={workflowId}
        version={version}
        onVersionChange={(next) => void navigate({ search: next ? { version: next } : {} })}
        onRunStarted={(executionId) =>
          void navigate({ to: "/executions/$executionId", params: { executionId } })
        }
      />
    );
  },
});
