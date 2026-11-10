import {
  type AgentDetail,
  AgentListQuerySchema,
  type AgentList,
  type SessionDetail,
  SessionListQuerySchema,
  type SessionList,
} from "@ubuliera/contracts";
import { type Hono } from "hono";

import { type AgentRepository } from "../../modules/agent-registry";
import { type EventStore } from "../../modules/event-manager";
import { type SessionRepository } from "../../modules/session-manager";
import { type AppBindings } from "../context";
import { AppError } from "../errors";

export interface SessionRouteDeps {
  sessions: SessionRepository;
  agents: AgentRepository;
  store: EventStore;
}

/** GET /sessions, /sessions/:id, /agents, /agents/:id (T061). */
export function registerSessionRoutes(api: Hono<AppBindings>, deps: SessionRouteDeps): void {
  api.get("/sessions", (c) => {
    const q = SessionListQuerySchema.parse(c.req.query());
    return c.json<SessionList>({ items: deps.sessions.list(q) });
  });

  api.get("/sessions/:id", (c) => {
    const session = deps.sessions.get(c.req.param("id"));
    if (!session) throw new AppError("NOT_FOUND", "Session not found");
    return c.json<SessionDetail>({ session, agents: deps.agents.bySession(session.id) });
  });

  api.get("/agents", (c) => {
    const q = AgentListQuerySchema.parse(c.req.query());
    return c.json<AgentList>({ items: deps.agents.list(q) });
  });

  api.get("/agents/:id", (c) => {
    const agent = deps.agents.get(c.req.param("id"));
    if (!agent) throw new AppError("NOT_FOUND", "Agent not found");
    const isMain = agent.kind === "main";
    return c.json<AgentDetail>({
      agent,
      session: deps.sessions.get(agent.sessionId) ?? null,
      children: deps.agents.children(agent.id),
      filesChanged: deps.store.filesModified(agent.sessionId, isMain ? null : agent.id),
    });
  });
}
