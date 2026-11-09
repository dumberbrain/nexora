import { type Agent } from "@/entities/agent";
import { type Session } from "@/entities/session";

type SessionCaps = Pick<Session, "id" | "observeOnly" | "capabilities">;

/** Who receives the message: a session's main agent, or one agent of a session. */
export type MessageTarget =
  | { kind: "session"; session: SessionCaps }
  | { kind: "agent"; agent: Pick<Agent, "id" | "kind" | "name">; session: SessionCaps | null };

const RUNTIME: Record<Session["runtime"], string> = {
  agent_sdk: "Agent SDK",
  cli_headless: "Headless CLI",
  agent_team_pty: "Agent Teams (PTY)",
  external_observed: "Observed",
};

export function targetName(t: MessageTarget): string {
  return t.kind === "session" ? "the main agent" : t.agent.name;
}

/** Why messages cannot be sent to the target, from its session's capabilities only (FR-031). */
export function messageBlockedReason(t: MessageTarget): string | null {
  const session = t.session;
  if (!session) return "The agent's session is unknown, so it cannot receive messages";
  if (session.observeOnly || session.capabilities.runtime === "external_observed") {
    return "Observe-only session — Nexora did not start it, so it cannot receive messages";
  }
  const can = session.capabilities.canSendMessage;
  if (can === "no") {
    return `Not supported: ${RUNTIME[session.capabilities.runtime]} sessions cannot receive messages`;
  }
  if (can === "lead_only" && t.kind === "agent" && !["main", "team_lead"].includes(t.agent.kind)) {
    return "Only the team lead can receive messages in this runtime";
  }
  return null;
}
