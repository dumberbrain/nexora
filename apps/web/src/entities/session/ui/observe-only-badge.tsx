import { EyeIcon } from "lucide-react";

import { cn } from "@/shared/lib/cn";

/** FR-033: sessions Ubuliera only observes keep Claude Code's own permissions — say so. */
export function ObserveOnlyBadge({ className }: { className?: string }) {
  return (
    <span
      title="Started outside Ubuliera — monitored through hooks; Ubuliera cannot control it"
      className={cn(
        "inline-flex items-center gap-1 border border-status-waiting/50 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-status-waiting uppercase",
        className,
      )}
    >
      <EyeIcon className="size-3" aria-hidden="true" />
      observe-only
    </span>
  );
}
