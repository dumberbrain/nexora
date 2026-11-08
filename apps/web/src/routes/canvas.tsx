import { createFileRoute } from "@tanstack/react-router";

import { canvasSearchSchema, CanvasView, loadCanvas } from "@/views/canvas";

export const Route = createFileRoute("/canvas")({
  validateSearch: canvasSearchSchema,
  loaderDeps: ({ search }) => ({ sessionId: search.sessionId }),
  loader: ({ context, deps }) => loadCanvas(context.queryClient, deps.sessionId),
  component: function CanvasRoute() {
    const { sessionId } = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <CanvasView
        sessionId={sessionId}
        onSessionChange={(next) => void navigate({ search: next ? { sessionId: next } : {} })}
      />
    );
  },
});
