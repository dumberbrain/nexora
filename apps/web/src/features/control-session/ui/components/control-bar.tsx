import { useState } from "react";

import { cn } from "@/shared/lib/cn";

import { ControlButton } from "./control-button";
import { type ControlTarget, StopConfirmDialog } from "./stop-confirm-dialog";
import { type ControlState } from "../../lib/derive-controls";

interface ControlBarProps {
  target: ControlTarget;
  controls: ControlState[];
  /** run one control; resolves when the request settled */
  onRun: (kind: ControlState["kind"]) => Promise<unknown>;
  busy: boolean;
  error: Error | null;
  className?: string;
}

/** Toolbar of controls; Stop goes through a confirmation dialog first. */
export function ControlBar({ target, controls, onRun, busy, error, className }: ControlBarProps) {
  const [confirmStop, setConfirmStop] = useState(false);
  const activate = (kind: ControlState["kind"]) => {
    if (kind === "stop") setConfirmStop(true);
    else void onRun(kind).catch(() => undefined);
  };
  const stop = () =>
    void onRun("stop")
      .then(() => setConfirmStop(false))
      .catch(() => setConfirmStop(false));

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div
        role="toolbar"
        aria-label={`${target === "session" ? "Session" : "Execution"} controls`}
        className="flex flex-wrap items-center gap-2"
      >
        {controls.map((c) => (
          <ControlButton key={c.kind} control={c} busy={busy} onActivate={() => activate(c.kind)} />
        ))}
      </div>
      {error ? (
        <p role="alert" className="font-mono text-xs text-destructive">
          Control failed: {error.message}
        </p>
      ) : null}
      <StopConfirmDialog
        target={target}
        open={confirmStop}
        onOpenChange={setConfirmStop}
        busy={busy}
        onConfirm={stop}
      />
    </div>
  );
}
