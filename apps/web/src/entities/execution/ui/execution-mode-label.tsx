import { cn } from "@/shared/lib/cn";

import { EXECUTION_MODE_LABEL, STRATEGY_LABEL } from "../model/labels";
import { type ExecutionMode, type Strategy } from "../model/types";

interface ExecutionModeLabelProps {
  mode: ExecutionMode | null;
  strategy?: Strategy | null;
  className?: string;
}

/** Mode (+ strategy) of an execution; "mode not chosen" until the user picks one. */
export function ExecutionModeLabel({ mode, strategy, className }: ExecutionModeLabelProps) {
  if (mode === null) {
    return (
      <span className={cn("font-mono text-xs text-muted-foreground", className)}>
        mode not chosen
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-xs", className)}>
      <span className="border border-phosphor/40 px-1.5 py-0.5 tracking-wider text-phosphor uppercase">
        {EXECUTION_MODE_LABEL[mode]}
      </span>
      {strategy ? (
        <span className="text-muted-foreground">· {STRATEGY_LABEL[strategy]}</span>
      ) : null}
    </span>
  );
}
