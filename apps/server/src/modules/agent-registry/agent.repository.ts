import { type Agent, type AgentListQuery } from "@ubuliera/contracts";
import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";

import { type Db } from "../../db/client";
import { agents, sessions } from "../../db/schema";

type Row = typeof agents.$inferSelect;
const toAgent = ({ updatedAt: _updatedAt, ...agent }: Row): Agent => agent;

export class AgentRepository {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now,
  ) {}

  get(id: string): Agent | undefined {
    const row = this.db.select().from(agents).where(eq(agents.id, id)).get();
    return row ? toAgent(row) : undefined;
  }

  insert(agent: Agent): void {
    this.db
      .insert(agents)
      .values({ ...agent, updatedAt: this.now() })
      .run();
  }

  update(id: string, patch: Partial<Omit<Agent, "id" | "sessionId">>): void {
    if (Object.keys(patch).length === 0) return;
    this.db
      .update(agents)
      .set({ ...patch, updatedAt: this.now() })
      .where(eq(agents.id, id))
      .run();
  }

  bySession(sessionId: string): Agent[] {
    return this.db
      .select()
      .from(agents)
      .where(eq(agents.sessionId, sessionId))
      .orderBy(asc(agents.updatedAt), asc(agents.id))
      .all()
      .map(toAgent);
  }

  children(parentAgentId: string): Agent[] {
    return this.db
      .select()
      .from(agents)
      .where(eq(agents.parentAgentId, parentAgentId))
      .orderBy(asc(agents.id))
      .all()
      .map(toAgent);
  }

  /** Most recently updated first. */
  list(q: AgentListQuery): Agent[] {
    const where: SQL[] = [];
    if (q.sessionId) where.push(eq(agents.sessionId, q.sessionId));
    if (q.status?.length) where.push(inArray(agents.status, q.status));
    if (q.executionId) {
      where.push(
        inArray(
          agents.sessionId,
          this.db
            .select({ id: sessions.id })
            .from(sessions)
            .where(eq(sessions.executionId, q.executionId)),
        ),
      );
    }
    return this.db
      .select()
      .from(agents)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(agents.updatedAt), asc(agents.id))
      .limit(q.limit)
      .all()
      .map(toAgent);
  }
}
