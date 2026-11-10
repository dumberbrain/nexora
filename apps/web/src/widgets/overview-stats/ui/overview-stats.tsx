import { useQuery } from "@tanstack/react-query";

import { statsQuery, type Stats } from "@/entities/stats";
import { useConnectionStore } from "@/shared/socket/client";
import { ErrorState, LoadingState } from "@/shared/ui/state";

import { StatCard } from "./components/stat-card";

type Tone = "default" | "live" | "alert";
type Card = { label: string; value: string; hint?: string; tone: Tone };

/** The 8 FR-024 counters, in a fixed order so [01]…[08] never move. */
function toCards(s: Stats): Card[] {
  const live = (n: number): Tone => (n > 0 ? "live" : "default");
  return [
    { label: "Active sessions", value: String(s.activeSessions), tone: live(s.activeSessions) },
    { label: "Active agents", value: String(s.activeAgents), tone: live(s.activeAgents) },
    { label: "Idle agents", value: String(s.idleAgents), tone: "default" },
    { label: "Completed tasks", value: String(s.completedTasks), tone: "default" },
    {
      label: "Failed tasks",
      value: String(s.failedTasks),
      tone: s.failedTasks > 0 ? "alert" : "default",
    },
    {
      label: "Pending approvals",
      value: String(s.pendingApprovals),
      tone: s.pendingApprovals > 0 ? "alert" : "default",
    },
    {
      label: "Running workflows",
      value: String(s.runningWorkflows),
      tone: live(s.runningWorkflows),
    },
    {
      label: "Current mode",
      value: s.currentMode ? s.currentMode.replaceAll("_", " ") : "none",
      tone: s.currentMode ? "live" : "default",
      ...(s.currentMode ? {} : { hint: "no Ubuliera execution" }),
    },
  ];
}

/** Overview counters: seeded by GET /stats, then pushed live by the `stats` socket event. */
export function OverviewStats() {
  const stats = useQuery(statsQuery());
  const connection = useConnectionStore((s) => s.state);

  if (stats.isPending) return <LoadingState label="Loading overview counters" rows={2} />;
  if (stats.isError) {
    return (
      <ErrorState
        title="Counters unavailable"
        error={stats.error}
        onRetry={() => void stats.refetch()}
      />
    );
  }

  return (
    <section aria-labelledby="overview-stats-title" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="overview-stats-title" className="text-sm tracking-widest text-foreground">
          Live counters
        </h2>
        <p role="status" className="font-mono text-[11px] text-muted-foreground">
          {connection === "connected" ? (
            <span className="text-phosphor">● live</span>
          ) : (
            <span className="text-status-paused">
              ○ realtime {connection} — counters may be stale
            </span>
          )}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {toCards(stats.data).map((card, i) => (
          <StatCard key={card.label} index={String(i + 1).padStart(2, "0")} {...card} />
        ))}
      </div>
    </section>
  );
}
