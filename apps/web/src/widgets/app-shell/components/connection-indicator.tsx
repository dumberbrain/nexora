import { cn } from "@/shared/lib/cn";
import { type ConnectionState, useConnectionStore } from "@/shared/socket/client";

const VIEW: Record<ConnectionState, { text: string; dot: string; label: string }> = {
  connected: { text: "live", dot: "bg-phosphor shadow-glow", label: "Realtime connected" },
  connecting: {
    text: "connecting",
    dot: "bg-status-paused animate-term-blink",
    label: "Connecting",
  },
  reconnecting: {
    text: "reconnecting",
    dot: "bg-status-paused animate-term-blink",
    label: "Realtime reconnecting — data may be stale",
  },
  offline: { text: "offline", dot: "bg-status-failed", label: "Realtime offline — data is stale" },
};

/** Realtime link status. Staleness is shown, never hidden (constitution III). */
export function ConnectionIndicator() {
  const state = useConnectionStore((s) => s.state);
  const view = VIEW[state];
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={view.label}
      title={view.label}
      className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-muted-foreground uppercase"
    >
      <span className={cn("size-2 rounded-full", view.dot)} aria-hidden="true" />
      <span className={cn(state === "connected" && "text-phosphor")}>{view.text}</span>
    </div>
  );
}
