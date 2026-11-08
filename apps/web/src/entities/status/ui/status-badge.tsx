import { cva } from "class-variance-authority";
import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleHelpIcon,
  CirclePauseIcon,
  CircleStopIcon,
  CircleXIcon,
  HourglassIcon,
  MoonIcon,
  RadioIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/shared/lib/cn";

import { STATUS_LABEL, type StatusKind } from "../model/status-kind";

const badge = cva(
  "inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[11px] tracking-wider uppercase whitespace-nowrap",
  {
    variants: {
      kind: {
        running: "border-status-running/50 bg-status-running/10 text-status-running",
        idle: "border-status-idle/40 text-status-idle",
        paused: "border-status-paused/50 bg-status-paused/10 text-status-paused",
        waiting: "border-status-waiting/50 bg-status-waiting/10 text-status-waiting",
        pending: "border-dashed border-status-idle/50 text-status-idle",
        stopped: "border-status-stopped/50 text-status-stopped",
        failed: "border-status-failed/60 bg-status-failed/10 text-status-failed",
        completed: "border-status-completed/50 bg-status-completed/10 text-status-completed",
        unresponsive: "border-status-failed/40 border-dashed text-status-paused",
        unknown: "border-dashed border-status-unknown/60 text-status-unknown",
      },
    },
  },
);

const ICON: Record<StatusKind, LucideIcon> = {
  running: RadioIcon,
  idle: MoonIcon,
  paused: CirclePauseIcon,
  waiting: HourglassIcon,
  pending: CircleDashedIcon,
  stopped: CircleStopIcon,
  failed: CircleXIcon,
  completed: CircleCheckIcon,
  unresponsive: TriangleAlertIcon,
  unknown: CircleHelpIcon,
};

interface StatusBadgeProps {
  kind: StatusKind;
  /** override the default label, e.g. the raw status for tooltips */
  label?: string;
  className?: string;
}

/** Distinct colour + icon + text label for every state — never colour alone (FR-032). */
export function StatusBadge({ kind, label, className }: StatusBadgeProps) {
  const Icon = ICON[kind];
  return (
    <span data-kind={kind} className={cn(badge({ kind }), className)}>
      <Icon className={cn("size-3", kind === "running" && "animate-pulse")} aria-hidden="true" />
      {label ?? STATUS_LABEL[kind]}
    </span>
  );
}
