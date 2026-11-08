import { type Agent, type AgentStatus } from "@nexora/contracts";

import { type AgentRepository } from "./agent.repository";
import { redactString } from "../../lib/redactor";
import { type EventBus } from "../event-manager/event-bus";

/** One hook delivery, reduced to what the agent tree needs. */
export interface AgentObservation {
  sessionId: string;
  hookEventName: string;
  /** set when the event happened inside a subagent */
  agentId: string | null;
  agentType: string | null;
  toolName: string | null;
  toolUseId: string | null;
  /** tool_input.subagent_type of an Agent tool call */
  subagentType: string | null;
  lastAssistantMessage: string | null;
}

export interface AgentTreeResult {
  /** parent chosen for a SubagentStart (derived linkage) */
  parentAgentId: string | null;
}

interface PendingSpawn {
  toolUseId: string;
  callerId: string;
  subagentType: string | null;
}

/** Tool names Claude Code uses to spawn a subagent ("Task" before 2.x). */
const SPAWN_TOOLS = new Set(["Agent", "Task"]);
const TERMINAL = new Set<AgentStatus>(["completed", "failed", "stopped"]);
const MAX_SUMMARY = 20_000;
const MAX_PENDING_PER_SESSION = 64;
const MAX_NAME = 200;

const summaryOf = (text: string) => redactString(text).slice(0, MAX_SUMMARY);

/**
 * Agent registry projection (T059). The main agent's id is the session id; subagents use
 * Claude's `agent_id`. SubagentStart carries no tool_use_id (S1), so the parent is the caller of
 * the most recent unmatched `Agent` tool call in that session, preferring a call whose
 * subagent_type matches — reliability "derived".
 */
export class AgentTree {
  private readonly pendingSpawns = new Map<string, PendingSpawn[]>();

  constructor(
    private readonly repo: AgentRepository,
    private readonly bus: EventBus,
  ) {}

  apply(o: AgentObservation): AgentTreeResult {
    const main = this.ensureMain(o.sessionId);
    const caller = o.agentId ?? main.id;

    switch (o.hookEventName) {
      case "SubagentStart":
        return { parentAgentId: o.agentId ? this.spawn(o, o.agentId) : null };
      case "SubagentStop":
        if (o.agentId) {
          this.ensureSubagent(o, o.agentId, main.id);
          this.set(o.agentId, {
            status: "completed",
            ...(o.lastAssistantMessage ? { summary: summaryOf(o.lastAssistantMessage) } : {}),
          });
        }
        break;
      case "Stop":
        this.set(main.id, {
          status: "idle",
          ...(o.lastAssistantMessage ? { summary: summaryOf(o.lastAssistantMessage) } : {}),
        });
        break;
      case "StopFailure":
        this.set(caller, { status: "failed" });
        break;
      case "SessionEnd":
        this.pendingSpawns.delete(o.sessionId);
        for (const a of this.repo.bySession(o.sessionId)) {
          if (!TERMINAL.has(a.status)) this.set(a.id, { status: "stopped" });
        }
        break;
      case "PermissionRequest":
      case "Notification":
        this.activity(o, main.id, "waiting");
        break;
      case "TeammateIdle":
      case "CwdChanged":
        break;
      default:
        this.trackSpawnCalls(o, caller);
        this.activity(o, main.id, "running");
    }
    return { parentAgentId: null };
  }

  private ensureMain(sessionId: string): Agent {
    const existing = this.repo.get(sessionId);
    if (existing) return existing;
    const main: Agent = {
      id: sessionId,
      sessionId,
      parentAgentId: null,
      kind: "main",
      name: "main",
      role: null,
      definitionPath: null,
      status: "running",
      currentTaskId: null,
      summary: null,
    };
    this.repo.insert(main);
    this.publish(main.id, main);
    return main;
  }

  private ensureSubagent(o: AgentObservation, id: string, parentAgentId: string): Agent {
    const existing = this.repo.get(id);
    if (existing) return existing;
    const type = (o.agentType ?? "subagent").slice(0, MAX_NAME) || "subagent";
    const agent: Agent = {
      id,
      sessionId: o.sessionId,
      parentAgentId,
      kind: "subagent",
      name: type,
      role: o.agentType ? type : null,
      definitionPath: null,
      status: "running",
      currentTaskId: null, // observed sessions carry no Nexora task
      summary: null,
    };
    this.repo.insert(agent);
    this.publish(id, agent);
    return agent;
  }

  /** PreToolUse(Agent) opens a pending spawn; its PostToolUse/Failure closes it. */
  private trackSpawnCalls(o: AgentObservation, callerId: string): void {
    if (!o.toolName || !SPAWN_TOOLS.has(o.toolName) || !o.toolUseId) return;
    const list = this.pendingSpawns.get(o.sessionId) ?? [];
    if (o.hookEventName === "PreToolUse") {
      list.push({ toolUseId: o.toolUseId, callerId, subagentType: o.subagentType });
      if (list.length > MAX_PENDING_PER_SESSION) list.shift();
      this.pendingSpawns.set(o.sessionId, list);
    } else if (o.hookEventName === "PostToolUse" || o.hookEventName === "PostToolUseFailure") {
      const i = list.findIndex((p) => p.toolUseId === o.toolUseId);
      if (i >= 0) list.splice(i, 1);
    }
  }

  private spawn(o: AgentObservation, agentId: string): string {
    const list = this.pendingSpawns.get(o.sessionId) ?? [];
    let index = list.findLastIndex(
      (p) => p.subagentType !== null && p.subagentType === o.agentType,
    );
    if (index < 0) index = list.length - 1;
    const [call] = index >= 0 ? list.splice(index, 1) : [];
    const parent = call && this.repo.get(call.callerId) ? call.callerId : o.sessionId;

    const existing = this.repo.get(agentId);
    if (existing) {
      this.set(agentId, { status: "running" });
      return existing.parentAgentId ?? parent;
    }
    this.ensureSubagent(o, agentId, parent);
    return parent;
  }

  /** Work by an agent: main always revives; finished subagents stay finished. */
  private activity(o: AgentObservation, mainId: string, status: AgentStatus): void {
    if (!o.agentId) {
      this.set(mainId, { status });
      return;
    }
    const agent = this.ensureSubagent(o, o.agentId, mainId);
    if (!TERMINAL.has(agent.status)) this.set(agent.id, { status });
  }

  private set(id: string, patch: Partial<Pick<Agent, "status" | "summary">>): void {
    const current = this.repo.get(id);
    if (!current) return;
    const changed: Partial<Agent> = {};
    if (patch.status !== undefined && patch.status !== current.status)
      changed.status = patch.status;
    if (patch.summary !== undefined && patch.summary !== current.summary) {
      changed.summary = patch.summary;
    }
    this.repo.update(id, changed);
    this.publish(id, changed);
  }

  private publish(id: string, patch: Partial<Agent>): void {
    if (Object.keys(patch).length === 0) return;
    this.bus.publishEntityChanged({ kind: "agent", id, patch: { ...patch } });
  }
}
