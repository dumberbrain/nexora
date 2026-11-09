import { eq } from "drizzle-orm";

import { type Db } from "../../db/client";
import { settings } from "../../db/schema";
import { type AuditService } from "../permission-manager/audit.service";

const keyOf = (projectId: string) => `consent.model_usage.${projectId}`;

/**
 * Per-project "always allow model-backed analysis/planning" preference (FR-008). Off unless the
 * user turned it on; revocable at any time; every change is audited.
 */
export class ConsentService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly now: () => number = Date.now,
  ) {}

  isAlwaysAllowed(projectId: string): boolean {
    const row = this.db
      .select()
      .from(settings)
      .where(eq(settings.key, keyOf(projectId)))
      .get();
    return row?.value === true;
  }

  setAlwaysAllow(projectId: string, alwaysAllow: boolean, actor: string): void {
    const updatedAt = this.now();
    this.db
      .insert(settings)
      .values({ key: keyOf(projectId), value: alwaysAllow, updatedAt })
      .onConflictDoUpdate({ target: settings.key, set: { value: alwaysAllow, updatedAt } })
      .run();
    this.audit.record({
      actor,
      action: "consent.model_usage.set",
      targetType: "project",
      targetId: projectId,
      outcome: "success",
      details: { alwaysAllow },
    });
  }
}
