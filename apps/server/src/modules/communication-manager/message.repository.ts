import { type Message, type MessageList, type MessageListQuery } from "@ubuliera/contracts";
import { and, asc, desc, eq, lt, type SQL } from "drizzle-orm";

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

  /** Communication Center feed: newest first; `cursor` (a message id) returns older ones. */
  page(q: MessageListQuery): MessageList {
    const where: SQL[] = [];
    if (q.executionId) where.push(eq(messages.executionId, q.executionId));
    if (q.taskId) where.push(eq(messages.taskId, q.taskId));
    if (q.type) where.push(eq(messages.type, q.type));
    if (q.cursor) where.push(lt(messages.id, q.cursor));
    const rows = this.db
      .select()
      .from(messages)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(messages.id))
      .limit(q.limit + 1)
      .all();
    const items = rows.slice(0, q.limit).map(toMessage);
    const nextCursor = rows.length > q.limit ? (items.at(-1)?.id ?? null) : null;
    return { items, nextCursor };
  }
}
