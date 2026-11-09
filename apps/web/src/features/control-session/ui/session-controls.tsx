import { type Session } from "@/entities/session";

import { ControlBar } from "./components/control-bar";
import { deriveSessionControls } from "../lib/derive-controls";
import { useSessionControl } from "../model/use-controls";

interface SessionControlsProps {
  session: Pick<Session, "id" | "status" | "observeOnly" | "capabilities">;
  className?: string;
}

/** Stop · Interrupt & hold · Resume · Restart for one session, from its capability profile. */
export function SessionControls({ session, className }: SessionControlsProps) {
  const control = useSessionControl(session.id);
  return (
    <ControlBar
      target="session"
      controls={deriveSessionControls(session)}
      onRun={(kind) => control.mutateAsync(kind)}
      busy={control.isPending}
      error={control.error}
      {...(className ? { className } : {})}
    />
  );
}
