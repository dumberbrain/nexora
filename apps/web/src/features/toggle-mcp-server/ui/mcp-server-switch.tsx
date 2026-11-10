import { useId } from "react";

import { cn } from "@/shared/lib/cn";
import { Switch } from "@/shared/ui/switch";

import { useUpdateMcp } from "../model/use-update-mcp";

interface McpServerSwitchProps {
  enabled: boolean;
  className?: string;
}

/** Enable/disable the optional MCP server (off by default; disabled ⇒ /mcp answers 404). */
export function McpServerSwitch({ enabled, className }: McpServerSwitchProps) {
  const labelId = useId();
  const update = useUpdateMcp();
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center gap-3">
        <Switch
          aria-labelledby={labelId}
          checked={enabled}
          disabled={update.isPending}
          aria-busy={update.isPending}
          onCheckedChange={(next) => update.mutate(next)}
        />
        <span id={labelId} className="font-mono text-xs tracking-widest uppercase">
          Enable MCP server
        </span>
        <span
          className={cn(
            "border px-1.5 font-mono text-[10px] tracking-widest uppercase",
            enabled ? "border-phosphor/60 text-phosphor" : "border-border text-muted-foreground",
          )}
        >
          {enabled ? "enabled" : "disabled"}
        </span>
      </div>
      {update.isError ? (
        <p role="alert" className="font-mono text-xs text-destructive">
          Could not {enabled ? "disable" : "enable"} the MCP server: {update.error.message}
        </p>
      ) : null}
    </div>
  );
}
