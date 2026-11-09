import { type Message } from "@nexora/contracts";
import { asc, eq } from "drizzle-orm";

import { type Db } from "../../db/client";
import { messages } from "../../db/schema";

type Row = typeof messages.$inferSelect;
const toMessage = (r: Row): Message => ({ ...r, type: r.type as Message["type"] });

export class MessageRepository {
  constructor(private readonly db: Db) {}

  insert(m: Message): Message {
    this.db.insert(messages).values(m).run();
    return m;
  }

  /** Oldest first (conversation order). */
  list(q: { executionId?: string } = {}): Message[] {
    return this.db
      .select()
      .from(messages)
      .where(q.executionId ? eq(messages.executionId, q.executionId) : undefined)
      .orderBy(asc(messages.id))
      .all()
      .map(toMessage);
  }
}
