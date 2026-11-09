import {
  type ControlKind,
  PAUSE_CONTROL_LABEL,
  type RuntimeCapabilityProfile,
} from "@nexora/contracts";

import { CapabilityUnsupportedError } from "./runtime-adapter";
import { AppError } from "../../http/errors";

export interface ControlSupport {
  supported: boolean;
  /** why the control is unavailable (UI tooltip text); null when supported */
  reason: string | null;
}

export interface ControlOptions {
  /** send_message: the session's main/lead agent (default) or another agent of the session */
  target?: "main" | "agent";
}

const yes: ControlSupport = { supported: true, reason: null };
const no = (reason: string): ControlSupport => ({ supported: false, reason });

/**
 * Capability gate (T109, FR-016/FR-031): whether a control is available on a runtime, derived
 * only from its {@link RuntimeCapabilityProfile}. `pause` is "Interrupt & hold" — a native pause
 * or interrupt + resume. Task controls are executed by the orchestrator, so they only need a
 * runtime Nexora can start.
 */
export function controlSupport(
  p: RuntimeCapabilityProfile,
  control: ControlKind,
  opts: ControlOptions = {},
): ControlSupport {
  const r = p.runtime;
  switch (control) {
    case "stop":
      return p.canStop ? yes : no(`${r} sessions cannot be stopped by Nexora`);
    case "interrupt":
      return p.canInterrupt ? yes : no(`${r} does not support interrupting a turn`);
    case "pause":
      return p.canPause || (p.canInterrupt && p.canResume)
        ? yes
        : no(`${r} cannot ${PAUSE_CONTROL_LABEL} (it needs interrupt and resume)`);
    case "resume":
      return p.canResume ? yes : no(`${r} does not support resuming a session`);
    case "restart":
      return p.canRestart ? yes : no(`${r} does not support restarting a session`);
    case "send_message":
      if (p.canSendMessage === "no") return no(`${r} sessions cannot receive messages`);
      if (p.canSendMessage === "lead_only" && opts.target === "agent") {
        return no(`${r} only accepts messages for the lead agent`);
      }
      return yes;
    case "cancel_task":
    case "retry_task":
    case "request_review":
    case "assign_task":
      return p.canStart ? yes : no(`${r} is not run by Nexora; its tasks cannot be controlled`);
  }
}

/**
 * Throws 409 CONFLICT for observed sessions (observe-only, whatever their profile says) and
 * {@link CapabilityUnsupportedError} (422 CAPABILITY_UNSUPPORTED) when the runtime lacks it.
 */
export function assertControl(
  subject: { observeOnly: boolean; capabilities: RuntimeCapabilityProfile },
  control: ControlKind,
  opts: ControlOptions = {},
): void {
  if (subject.observeOnly) {
    throw new AppError(
      "CONFLICT",
      "This session was started outside Nexora and is observe-only; control it from its terminal",
    );
  }
  if (!controlSupport(subject.capabilities, control, opts).supported) {
    throw new CapabilityUnsupportedError(subject.capabilities.runtime, control);
  }
}

/** Execution-wide controls (pause/resume): every runtime of the execution must support it. */
export function assertAllSupport(
  profiles: readonly RuntimeCapabilityProfile[],
  control: ControlKind,
): void {
  for (const p of profiles) {
    if (!controlSupport(p, control).supported) {
      throw new CapabilityUnsupportedError(p.runtime, control);
    }
  }
}
