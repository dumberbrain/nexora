import { useMutation, useQueryClient } from "@tanstack/react-query";

import { executionApi, executionKeys } from "@/entities/execution";
import { type SessionControlAction, sessionApi, sessionKeys } from "@/entities/session";
import { taskKeys } from "@/entities/task";

import { type ControlState } from "../lib/derive-controls";

/** UI control → session endpoint ("Interrupt & hold" interrupts the turn and keeps the session). */
const SESSION_ACTION: Partial<Record<ControlState["kind"], SessionControlAction>> = {
  stop: "stop",
  pause: "interrupt",
  resume: "resume",
  restart: "restart",
};

/** POST /sessions/:id/{stop,interrupt,resume,restart} → patch detail(id) + refresh lists. */
export function useSessionControl(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (kind: ControlState["kind"]) => {
      const action = SESSION_ACTION[kind];
      if (!action) throw new Error(`${kind} is not a session control`);
      return sessionApi.control(sessionId, action);
    },
    onSuccess: (session) => {
      qc.setQueryData(sessionKeys.detail(sessionId), session);
      return qc.invalidateQueries({ queryKey: sessionKeys.lists() });
    },
  });
}

type ExecutionAction = "stop" | "pause" | "resume";
const isExecutionAction = (k: ControlState["kind"]): k is ExecutionAction =>
  k === "stop" || k === "pause" || k === "resume";

/** POST /executions/:id/{stop,pause,resume} → patch detail(id) + refresh tasks and sessions. */
export function useExecutionControl(executionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (kind: ControlState["kind"]) => {
      if (!isExecutionAction(kind)) throw new Error(`${kind} is not an execution control`);
      return executionApi[kind](executionId);
    },
    onSuccess: (execution) => {
      qc.setQueryData(executionKeys.detail(executionId), execution);
      return Promise.all([
        qc.invalidateQueries({ queryKey: executionKeys.lists() }),
        qc.invalidateQueries({ queryKey: taskKeys.byExecution(executionId) }),
        qc.invalidateQueries({ queryKey: sessionKeys.lists() }),
      ]);
    },
  });
}
