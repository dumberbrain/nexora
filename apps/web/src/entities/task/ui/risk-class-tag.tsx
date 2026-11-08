import { cva } from "class-variance-authority";
import { ShieldAlertIcon } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import { humanize } from "@/shared/lib/humanize";

import { type RiskClass } from "../model/types";

const tag = cva(
  "inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[10px] tracking-wider whitespace-nowrap uppercase",
  {
    variants: {
      risk: {
        normal: "border-border text-muted-foreground",
        destructive: "border-status-failed/60 bg-status-failed/10 text-status-failed",
        expensive: "border-status-paused/60 bg-status-paused/10 text-status-paused",
        deploy: "border-status-waiting/60 bg-status-waiting/10 text-status-waiting",
        architecture: "border-status-paused/60 bg-status-paused/10 text-status-paused",
      },
    },
  },
);

interface RiskClassTagProps {
  risk: RiskClass;
  className?: string;
}

/** Risk class of a task or approval — anything but `normal` needs explicit approval (FR-033). */
export function RiskClassTag({ risk, className }: RiskClassTagProps) {
  return (
    <span data-risk={risk} className={cn(tag({ risk }), className)}>
      {risk === "normal" ? null : <ShieldAlertIcon className="size-3" aria-hidden="true" />}
      {risk === "normal" ? "normal" : `${humanize(risk)} risk`}
    </span>
  );
}
