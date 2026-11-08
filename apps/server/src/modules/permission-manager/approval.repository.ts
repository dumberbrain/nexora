import { type ApprovalRequest, type ApprovalStatus } from "@nexora/contracts";
import { and, desc, eq } from "drizzle-orm";

import { type Db } from "../../db/client";
import { approvalRequests } from "../../db/schema";

type Row = typeof approvalRequests.$inferSelect;

const toApproval = (r: Row): ApprovalRequest => ({ ...r, details: r.details ?? null });

export class ApprovalRepository {
  constructor(private readonly db: Db) {}

  insert(a: ApprovalRequest): ApprovalRequest {
    this.db.insert(approvalRequests).values(a).run();
    return a;
  }

  get(id: string): ApprovalRequest | undefined {
    const row = this.db.select().from(approvalRequests).where(eq(approvalRequests.id, id)).get();
    return row ? toApproval(row) : undefined;
  }

  list(q: { status?: ApprovalStatus; executionId?: string; sessionId?: string } = {}) {
    const where = [
      q.status ? eq(approvalRequests.status, q.status) : undefined,
      q.executionId ? eq(approvalRequests.executionId, q.executionId) : undefined,
      q.sessionId ? eq(approvalRequests.sessionId, q.sessionId) : undefined,
    ].filter((w) => w !== undefined);
    return this.db
      .select()
      .from(approvalRequests)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(approvalRequests.id))
      .all()
      .map(toApproval);
  }

  /** Only a pending request can be decided; returns undefined when it was not pending. */
  decide(
    id: string,
    patch: Pick<ApprovalRequest, "status" | "decidedBy" | "decidedAt" | "note">,
  ): ApprovalRequest | undefined {
    const res = this.db
      .update(approvalRequests)
      .set(patch)
      .where(and(eq(approvalRequests.id, id), eq(approvalRequests.status, "pending")))
      .run();
    return res.changes === 1 ? this.get(id) : undefined;
  }
}
