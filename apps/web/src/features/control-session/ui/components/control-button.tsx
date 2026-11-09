import { PauseIcon, PlayIcon, RotateCcwIcon, SquareIcon, type LucideIcon } from "lucide-react";

import { GuardedButton } from "@/shared/ui/control/guarded-button";

import { type ControlState } from "../../lib/derive-controls";

const ICON: Partial<Record<ControlState["kind"], LucideIcon>> = {
  stop: SquareIcon,
  pause: PauseIcon,
  resume: PlayIcon,
  restart: RotateCcwIcon,
};

interface ControlButtonProps {
  control: ControlState;
  busy: boolean;
  onActivate: () => void;
}

/** One control; unsupported/unavailable ones stay visible with their reason (FR-031). */
export function ControlButton({ control, busy, onActivate }: ControlButtonProps) {
  const Icon = ICON[control.kind];
  return (
    <GuardedButton
      size="xs"
      variant={control.kind === "stop" ? "destructive" : "outline"}
      disabledReason={control.enabled ? null : control.reason}
      disabled={busy && control.enabled}
      onClick={onActivate}
      className="rounded-sm font-mono uppercase"
    >
      {Icon ? <Icon aria-hidden="true" /> : null}
      {control.label}
    </GuardedButton>
  );
}
