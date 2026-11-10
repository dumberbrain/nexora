import { type Session, type SessionListQuery, type SessionStatus } from "@ubuliera/contracts";
import { and, desc, eq, inArray, type SQL } from "drizzle-orm";

import { type Db } from "../../db/client";
import { sessions } from "../../db/schema";

type Row = typeof sessions.$inferSelect;
const toSession = (row: Row): Session => ({ ...row });

export class SessionRepository {
  constructor(private readonly db: Db) {}

  get(id: string): Session | undefined {
    const row = this.db.select().from(sessions).where(eq(sessions.id, id)).get();
    return row ? toSession(row) : undefined;
  }

  insert(session: Session): void {
    this.db.insert(sessions).values(session).run();
  }

  update(id: string, patch: Partial<Omit<Session, "id">>): void {
    if (Object.keys(patch).length === 0) return;
    this.db.update(sessions).set(patch).where(eq(sessions.id, id)).run();
  }

  /** Every session in one of `statuses` (restart recovery). */
  listByStatus(statuses: readonly SessionStatus[]): Session[] {
    if (statuses.length === 0) return [];
    return this.db
      .select()
      .from(sessions)
      .where(inArray(sessions.status, [...statuses]))
      .all()
      .map(toSession);
  }

  /** Newest activity first. */
  list(q: SessionListQuery): Session[] {
    const where: SQL[] = [];
    if (q.status?.length) where.push(inArray(sessions.status, q.status));
    if (q.executionId) where.push(eq(sessions.executionId, q.executionId));
    if (q.projectId) where.push(eq(sessions.projectId, q.projectId));
    return this.db
      .select()
      .from(sessions)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(sessions.lastActivityAt))
      .limit(q.limit)
      .all()
      .map(toSession);
  }
}
