import { type Execution } from "@ubuliera/contracts";
import { desc, eq } from "drizzle-orm";

import { type Db } from "../../db/client";
import { executions } from "../../db/schema";

type Row = typeof executions.$inferSelect;
export type ExecutionPatch = Partial<Omit<Execution, "id" | "projectId" | "createdAt">>;

const toExecution = (r: Row): Execution => ({
  ...r,
  analysis: r.analysis ?? null,
  verification: r.verification ?? null,
});

export class ExecutionRepository {
  constructor(private readonly db: Db) {}

  insert(e: Execution): Execution {
    this.db.insert(executions).values(e).run();
    return e;
  }

  get(id: string): Execution | undefined {
    const row = this.db.select().from(executions).where(eq(executions.id, id)).get();
    return row ? toExecution(row) : undefined;
  }

  list(q: { projectId?: string } = {}): Execution[] {
    return this.db
      .select()
      .from(executions)
      .where(q.projectId ? eq(executions.projectId, q.projectId) : undefined)
      .orderBy(desc(executions.id))
      .all()
      .map(toExecution);
  }

  update(id: string, patch: ExecutionPatch): void {
    this.db.update(executions).set(patch).where(eq(executions.id, id)).run();
  }
}
