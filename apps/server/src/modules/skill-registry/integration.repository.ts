import { type IntegrationItem } from "@ubuliera/contracts";
import { asc, eq, isNull } from "drizzle-orm";

import { type Db } from "../../db/client";
import { integrations } from "../../db/schema";

type Row = typeof integrations.$inferSelect;

/** Item fields with no column of their own live under this metadata key; stripped on read. */
const EXTRA = "__item";

interface Extra {
  description: string | null;
  tools: IntegrationItem["tools"];
  healthDetail: string | null;
  checkedAt: number | null;
  /** the item's own projectId (null for user/plugin items) */
  projectId: string | null;
}

const identity = (i: Pick<IntegrationItem, "kind" | "scope" | "name" | "sourcePath">) =>
  `${i.kind}|${i.scope}|${i.name}|${i.sourcePath ?? ""}`;

/**
 * Integrations table (T146). Rows are grouped by inventory scope: `project_id` is the project the
 * inventory was taken for (null = user-only inventory), so user-level items appear in every
 * scope. A refresh replaces a scope's rows, keeping ids of items that still exist.
 */
export class IntegrationRepository {
  constructor(private readonly db: Db) {}

  private where(scopeProjectId: string | null) {
    return scopeProjectId === null
      ? isNull(integrations.projectId)
      : eq(integrations.projectId, scopeProjectId);
  }

  list(scopeProjectId: string | null): IntegrationItem[] {
    return this.db
      .select()
      .from(integrations)
      .where(this.where(scopeProjectId))
      .orderBy(asc(integrations.kind), asc(integrations.name))
      .all()
      .map(toItem);
  }

  /** Replace a scope's rows; returns the items with stable ids. */
  replace(scopeProjectId: string | null, items: IntegrationItem[]): IntegrationItem[] {
    const existing = new Map(this.list(scopeProjectId).map((i) => [identity(i), i.id]));
    const saved = items.map((i) => ({ ...i, id: existing.get(identity(i)) ?? i.id }));
    this.db.transaction((tx) => {
      tx.delete(integrations).where(this.where(scopeProjectId)).run();
      for (const i of saved) {
        const extra: Extra = {
          description: i.description,
          tools: i.tools,
          healthDetail: i.healthDetail,
          checkedAt: i.checkedAt,
          projectId: i.projectId,
        };
        tx.insert(integrations)
          .values({
            id: i.id,
            projectId: scopeProjectId,
            kind: i.kind,
            name: i.name,
            scope: i.scope,
            sourcePath: i.sourcePath,
            executable: i.executable,
            health: i.health,
            permissionStatus: i.permissionStatus,
            metadata: { ...i.metadata, [EXTRA]: extra },
            discoveredAt: i.discoveredAt,
          })
          .run();
      }
    });
    return saved;
  }
}

function toItem(row: Row): IntegrationItem {
  const { [EXTRA]: rawExtra, ...metadata } = row.metadata;
  const extra = (rawExtra ?? {}) as Partial<Extra>;
  return {
    id: row.id,
    projectId: extra.projectId ?? null,
    kind: row.kind as IntegrationItem["kind"],
    name: row.name,
    scope: row.scope as IntegrationItem["scope"],
    sourcePath: row.sourcePath,
    executable: row.executable,
    health: row.health as IntegrationItem["health"],
    permissionStatus: row.permissionStatus as IntegrationItem["permissionStatus"],
    metadata,
    discoveredAt: row.discoveredAt,
    description: extra.description ?? null,
    tools: extra.tools ?? [],
    healthDetail: extra.healthDetail ?? null,
    checkedAt: extra.checkedAt ?? null,
  };
}
