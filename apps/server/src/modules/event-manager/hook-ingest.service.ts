import { type Logger } from "../../lib/logger";
import { type AgentObservation, type AgentTree } from "../agent-registry";
import { hashToken } from "../project-registry/hook-installer";
import { type ProjectRepository, type ProjectRow } from "../project-registry/project.repository";
import { type SessionProjection } from "../session-manager";
import { type EventStore } from "./event-store";
import { normalizeHook } from "./normalizers/hook-normalizer";
import { type HookPayload, obj, str } from "./normalizers/hook-payload";

/** Real tokens are 43 chars; anything far longer is not worth hashing. */
const MAX_TOKEN_LENGTH = 512;

export interface HookIngestDeps {
  projects: ProjectRepository;
  sessions: SessionProjection;
  agents: AgentTree;
  store: EventStore;
  logger: Logger;
  now?: () => number;
}

function agentObservation(p: HookPayload): AgentObservation {
  return {
    sessionId: p.session_id,
    hookEventName: p.hook_event_name,
    agentId: str(p, "agent_id"),
    agentType: str(p, "agent_type"),
    toolName: str(p, "tool_name"),
    toolUseId: str(p, "tool_use_id"),
    subagentType: str(obj(p, "tool_input"), "subagent_type"),
    lastAssistantMessage: str(p, "last_assistant_message"),
  };
}

/**
 * Hook ingest pipeline (T057): token → project, then session projection → agent tree →
 * normalised events. Observed sessions are never steered, so callers always answer `{}`.
 * A failure in one stage is logged and never blocks the others or the HTTP response.
 */
export class HookIngestService {
  private readonly now: () => number;
  private readonly observers = new Set<(p: HookPayload) => void>();

  constructor(private readonly deps: HookIngestDeps) {
    this.now = deps.now ?? Date.now;
  }

  /** Project owning the X-Ubuliera-Hook-Token (only its sha-256 is stored). */
  authenticate(token: string | undefined): ProjectRow | undefined {
    if (!token || token.length > MAX_TOKEN_LENGTH) return undefined;
    return this.deps.projects.findByTokenHash(hashToken(token));
  }

  /**
   * Extra consumer of every accepted payload, after the projection (e.g. the Agent Teams PTY
   * adapter, which folds hooks of the leads it started into their team). Returns an unsubscribe.
   */
  addObserver(fn: (p: HookPayload) => void): () => void {
    this.observers.add(fn);
    return () => this.observers.delete(fn);
  }

  ingest(project: ProjectRow, p: HookPayload): void {
    const ts = this.now();
    const log = { sessionId: p.session_id, hook: p.hook_event_name };
    let parentAgentId: string | null = null;
    try {
      this.deps.sessions.apply({
        sessionId: p.session_id,
        hookEventName: p.hook_event_name,
        cwd: p.cwd ?? project.rootPath,
        tokenProjectId: project.id,
        ts,
      });
      parentAgentId = this.deps.agents.apply(agentObservation(p)).parentAgentId;
    } catch (err) {
      this.deps.logger.error({ err, ...log }, "hook projection failed");
    }
    try {
      for (const e of normalizeHook(p, { parentAgentId })) this.deps.store.append({ ...e, ts });
    } catch (err) {
      this.deps.logger.error({ err, ...log }, "hook event append failed");
    }
    for (const fn of this.observers) {
      try {
        fn(p);
      } catch (err) {
        this.deps.logger.error({ err, ...log }, "hook observer failed");
      }
    }
  }
}
