import { type ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

interface StatCardProps {
  index: string;
  label: string;
  value: ReactNode;
  hint?: string;
  /** highlight (phosphor glow + corner brackets) — e.g. something is running or needs attention */
  tone?: "default" | "live" | "alert";
}

/** Reactivite-style counter card: [0n] index, uppercase label, large mono value. */
export function StatCard({ index, label, value, hint, tone = "default" }: StatCardProps) {
  return (
    <article
      aria-label={label}
      className={cn(
        "flex flex-col gap-2 border border-border bg-card p-4 transition-colors",
        tone === "live" && "corner-brackets border-phosphor/40 shadow-glow",
        tone === "alert" && "corner-brackets border-status-waiting/50",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-index" aria-hidden="true">
          [{index}]
        </span>
        {hint ? <span className="font-mono text-[10px] text-muted-foreground">{hint}</span> : null}
      </div>
      <h3 className="text-xs tracking-widest text-muted-foreground">{label}</h3>
      <p
        className={cn(
          "font-mono text-3xl leading-none text-foreground tabular-nums",
          tone === "live" && "text-phosphor",
          tone === "alert" && "text-status-waiting",
        )}
      >
        {value}
      </p>
    </article>
  );
}
