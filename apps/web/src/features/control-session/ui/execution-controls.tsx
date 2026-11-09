import { useQuery } from "@tanstack/react-query";

import { type Execution } from "@/entities/execution";
import { sessionListQuery } from "@/entities/session";

import { ControlBar } from "./components/control-bar";
import { deriveExecutionControls } from "../lib/derive-controls";
import { useExecutionControl } from "../model/use-controls";

interface ExecutionControlsProps {
  execution: Pick<Execution, "id" | "status">;
  className?: string;
}

/**
 * Stop · Interrupt & hold · Resume for a whole execution. Availability comes from the
 * capability profiles of the execution's sessions plus the execution status.
 */
export function ExecutionControls({ execution, className }: ExecutionControlsProps) {
  const sessions = useQuery(sessionListQuery({ executionId: execution.id }));
  const control = useExecutionControl(execution.id);
  return (
    <ControlBar
      target="execution"
      controls={deriveExecutionControls(execution.status, sessions.data?.items ?? [])}
      onRun={(kind) => control.mutateAsync(kind)}
      busy={control.isPending || sessions.isPending}
      error={control.error}
      {...(className ? { className } : {})}
    />
  );
}
