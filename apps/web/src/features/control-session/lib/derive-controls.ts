import {
  type ControlKind,
  type ExecutionStatus,
  PAUSE_CONTROL_LABEL,
  type RuntimeCapabilityProfile,
  type RuntimeKind,
  type SessionStatus,
} from "@ubuliera/contracts";

import { type Session } from "@/entities/session";
import { humanize } from "@/shared/lib/humanize";

/** One control as the UI shows it: derived ONLY from capabilities + status (FR-016, FR-031). */
export interface ControlState {
  kind: ControlKind;
  label: string;
  enabled: boolean;
  /** why it is disabled — shown as tooltip + accessible description */
  reason: string | null;
}

export const RUNTIME_LABEL: Record<RuntimeKind, string> = {
  agent_sdk: "Agent SDK",
  cli_headless: "Headless CLI",
  agent_team_pty: "Agent Teams (PTY)",
  external_observed: "Observed",
};

export const CONTROL_LABEL = {
  stop: "Stop",
  pause: PAUSE_CONTROL_LABEL,
  resume: "Resume",
  restart: "Restart",
} as const;

export const OBSERVE_ONLY_REASON =
  "Observe-only session — Ubuliera did not start it, so it cannot be controlled here";

type Cap = keyof Pick<
  RuntimeCapabilityProfile,
  "canStop" | "canInterrupt" | "canResume" | "canRestart"
>;
const VERB: Record<Cap, string> = {
  canStop: "stop",
  canInterrupt: "interrupt",
  canResume: "resume",
  canRestart: "restart",
};

/** First missing capability across runtimes → reason, or null when all are supported. */
function missing(profiles: RuntimeCapabilityProfile[], caps: Cap[]): string | null {
  for (const cap of caps) {
    const lacking = profiles.find((p) => !p[cap]);
    if (lacking)
      return `Not supported: ${RUNTIME_LABEL[lacking.runtime]} sessions cannot ${VERB[cap]}`;
  }
  return null;
}

function control(
  kind: keyof typeof CONTROL_LABEL,
  capReason: string | null,
  statusOk: boolean,
  statusReason: string,
): ControlState {
  const reason = capReason ?? (statusOk ? null : statusReason);
  return { kind, label: CONTROL_LABEL[kind], enabled: reason === null, reason };
}

const ACTIVE: ReadonlySet<SessionStatus> = new Set([
  "starting",
  "running",
  "idle",
  "waiting_for_approval",
  "paused",
  "unresponsive",
]);
const BUSY: ReadonlySet<SessionStatus> = new Set([
  "running",
  "waiting_for_approval",
  "unresponsive",
]);
const RESUMABLE: ReadonlySet<SessionStatus> = new Set(["paused", "stopped", "failed"]);
const RESTARTABLE: ReadonlySet<SessionStatus> = new Set(["stopped", "failed", "unresponsive"]);

type SessionLike = Pick<Session, "status" | "observeOnly" | "capabilities">;

/** Session controls: Stop · Interrupt & hold · Resume · Restart. */
export function deriveSessionControls(session: SessionLike): ControlState[] {
  const kinds = ["stop", "pause", "resume", "restart"] as const;
  if (session.observeOnly || session.capabilities.runtime === "external_observed") {
    return kinds.map((k) => ({
      kind: k,
      label: CONTROL_LABEL[k],
      enabled: false,
      reason: OBSERVE_ONLY_REASON,
    }));
  }
  const caps = [session.capabilities];
  const s = session.status;
  const is = `The session is ${humanize(s)}`;
  return [
    control("stop", missing(caps, ["canStop"]), ACTIVE.has(s), `${is} — nothing to stop`),
    control(
      "pause",
      missing(caps, ["canInterrupt", "canResume"]),
      BUSY.has(s),
      `${is} — nothing to interrupt`,
    ),
    control("resume", missing(caps, ["canResume"]), RESUMABLE.has(s), `${is} — nothing to resume`),
    control(
      "restart",
      missing(caps, ["canRestart"]),
      RESTARTABLE.has(s),
      `${is} — restart is for stopped, failed or unresponsive sessions`,
    ),
  ];
}

const STOPPABLE: ReadonlySet<ExecutionStatus> = new Set(["running", "paused", "verifying"]);
const NO_SESSION = "No runtime session is active for this execution yet";

/**
 * Execution controls: Stop · Interrupt & hold · Resume. Pause/resume need EVERY runtime of the
 * execution to support interrupt + resume (server answers 422 otherwise).
 */
export function deriveExecutionControls(
  status: ExecutionStatus,
  sessions: SessionLike[],
): ControlState[] {
  const caps = sessions.map((x) => x.capabilities);
  const needSessions = (r: string | null) => (caps.length === 0 ? NO_SESSION : r);
  const is = `The execution is ${humanize(status)}`;
  return [
    control("stop", missing(caps, ["canStop"]), STOPPABLE.has(status), `${is} — nothing to stop`),
    control(
      "pause",
      needSessions(missing(caps, ["canInterrupt", "canResume"])),
      status === "running",
      `${is} — only a running execution can be interrupted`,
    ),
    control(
      "resume",
      needSessions(missing(caps, ["canResume"])),
      status === "paused",
      `${is} — nothing to resume`,
    ),
  ];
}
