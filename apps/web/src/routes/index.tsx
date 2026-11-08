import { createFileRoute } from "@tanstack/react-router";

// Replaced by the Overview view + app shell in Phase 2/3 (T045, T065).
export const Route = createFileRoute("/")({
  component: function IndexRoute() {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-terminal-grid p-4">
        <span className="text-index">[00] nexora</span>
        <h1 className="text-4xl text-foreground sm:text-6xl">Control Center</h1>
        <p className="text-sm text-muted-foreground">
          <span className="text-phosphor">$</span> booting
          <span className="animate-term-blink text-phosphor" aria-hidden="true">
            _
          </span>
        </p>
      </main>
    );
  },
});
