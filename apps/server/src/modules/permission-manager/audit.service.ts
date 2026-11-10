import { AuditActorSchema, type AuditEntry, type Page } from "@ubuliera/contracts";
import { desc, lt } from "drizzle-orm";

import { type Db } from "../../db/client";
import { auditEntries } from "../../db/schema";
import { redact } from "../../lib/redactor";
import { newId } from "../../lib/ulid";

export interface AuditInput {
  actor: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  outcome: AuditEntry["outcome"];
  details?: unknown;
}

/**
 * Append-only audit trail (FR-054, constitution III). There is intentionally no update or
 * delete method; retention never touches this table.
 */
export class AuditService {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now,
  ) {}

  record(input: AuditInput): AuditEntry {
    const entry: AuditEntry = {
      id: newId(),
      ts: this.now(),
      actor: AuditActorSchema.parse(input.actor),
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      outcome: input.outcome,
      details: input.details === undefined ? null : redact(input.details),
    };
    this.db.insert(auditEntries).values(entry).run();
    return entry;
  }

  list(q: { limit: number; cursor?: string }): Page<AuditEntry> {
    const rows = this.db
      .select()
      .from(auditEntries)
      .where(q.cursor ? lt(auditEntries.id, q.cursor) : undefined)
      .orderBy(desc(auditEntries.id))
      .limit(q.limit + 1)
      .all();
    const items = rows.slice(0, q.limit) as AuditEntry[];
    const nextCursor = rows.length > q.limit ? (items.at(-1)?.id ?? null) : null;
    return { items, nextCursor };
  }
}
