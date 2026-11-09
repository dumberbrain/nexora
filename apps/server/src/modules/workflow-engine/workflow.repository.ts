import {
  type WorkflowDefinition,
  type WorkflowGraph,
  type WorkflowNodeRun,
  type WorkflowRun,
  type WorkflowSummary,
  type WorkflowVersion,
} from "@nexora/contracts";
import { and, asc, desc, eq, max } from "drizzle-orm";

import { type WorkflowRunStore } from "./executor";
import { type Db } from "../../db/client";
import {
  workflowDefinitions,
  workflowNodeRuns,
  workflowRuns,
  workflowVersions,
} from "../../db/schema";
import { newId } from "../../lib/ulid";

type DefinitionRow = typeof workflowDefinitions.$inferSelect;
type RunRow = typeof workflowRuns.$inferSelect;
type NodeRunRow = typeof workflowNodeRuns.$inferSelect;

const toDefinition = (r: DefinitionRow): WorkflowDefinition => ({
  id: r.id,
  name: r.name,
  description: r.description,
  createdAt: r.createdAt,
});
const toRun = (r: RunRow): WorkflowRun => ({ ...r, status: r.status as WorkflowRun["status"] });
const toNodeRun = (r: NodeRunRow): WorkflowNodeRun => ({
  ...r,
  status: r.status as WorkflowNodeRun["status"],
});

/**
 * Workflow persistence (T126). Versions are immutable — there is no update or delete for them —
 * and each save gets `version = max + 1` inside one transaction (unique per definition).
 * Also the executor's {@link WorkflowRunStore}.
 */
export class WorkflowRepository implements WorkflowRunStore {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now,
  ) {}

  // ------------------------------------------------------------ definitions

  createDefinition(input: { name: string; description: string; builtIn?: boolean }) {
    const createdAt = this.now();
    const row = {
      id: newId(createdAt),
      name: input.name,
      description: input.description,
      builtIn: input.builtIn ?? false,
      createdAt,
    };
    this.db.insert(workflowDefinitions).values(row).run();
    return { ...toDefinition(row), builtIn: row.builtIn };
  }

  getDefinition(id: string): WorkflowSummary | undefined {
    const row = this.db
      .select()
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.id, id))
      .get();
    return row ? this.summary(row) : undefined;
  }

  findBuiltIn(name: string): WorkflowSummary | undefined {
    const row = this.db
      .select()
      .from(workflowDefinitions)
      .where(and(eq(workflowDefinitions.name, name), eq(workflowDefinitions.builtIn, true)))
      .get();
    return row ? this.summary(row) : undefined;
  }

  /** Newest first. */
  listDefinitions(): WorkflowSummary[] {
    return this.db
      .select()
      .from(workflowDefinitions)
      .orderBy(desc(workflowDefinitions.id))
      .all()
      .map((r) => this.summary(r));
  }

  private summary(row: DefinitionRow): WorkflowSummary {
    return { ...toDefinition(row), builtIn: row.builtIn, latestVersion: this.latestNumber(row.id) };
  }

  private latestNumber(definitionId: string): number | null {
    const r = this.db
      .select({ v: max(workflowVersions.version) })
      .from(workflowVersions)
      .where(eq(workflowVersions.definitionId, definitionId))
      .get();
    return r?.v ?? null;
  }

  // ------------------------------------------------------------ versions (immutable)

  insertVersion(definitionId: string, graph: WorkflowGraph): WorkflowVersion {
    return this.db.transaction((tx) => {
      const r = tx
        .select({ v: max(workflowVersions.version) })
        .from(workflowVersions)
        .where(eq(workflowVersions.definitionId, definitionId))
        .get();
      const createdAt = this.now();
      const row: WorkflowVersion = {
        id: newId(createdAt),
        definitionId,
        version: (r?.v ?? 0) + 1,
        graph,
        createdAt,
      };
      tx.insert(workflowVersions).values(row).run();
      return row;
    });
  }

  getVersion(definitionId: string, version: number): WorkflowVersion | undefined {
    return this.db
      .select()
      .from(workflowVersions)
      .where(
        and(eq(workflowVersions.definitionId, definitionId), eq(workflowVersions.version, version)),
      )
      .get();
  }

  getVersionById(id: string): WorkflowVersion | undefined {
    return this.db.select().from(workflowVersions).where(eq(workflowVersions.id, id)).get();
  }

  latestVersion(definitionId: string): WorkflowVersion | undefined {
    return this.db
      .select()
      .from(workflowVersions)
      .where(eq(workflowVersions.definitionId, definitionId))
      .orderBy(desc(workflowVersions.version))
      .limit(1)
      .get();
  }

  /** Newest first, without graphs. */
  listVersions(definitionId: string): Omit<WorkflowVersion, "graph">[] {
    return this.db
      .select({
        id: workflowVersions.id,
        definitionId: workflowVersions.definitionId,
        version: workflowVersions.version,
        createdAt: workflowVersions.createdAt,
      })
      .from(workflowVersions)
      .where(eq(workflowVersions.definitionId, definitionId))
      .orderBy(desc(workflowVersions.version))
      .all();
  }

  // ------------------------------------------------------------ runs

  insertRun(run: WorkflowRun): WorkflowRun {
    this.db.insert(workflowRuns).values(run).run();
    return run;
  }

  getRun(id: string): WorkflowRun | undefined {
    const row = this.db.select().from(workflowRuns).where(eq(workflowRuns.id, id)).get();
    return row ? toRun(row) : undefined;
  }

  runOfExecution(executionId: string): WorkflowRun | undefined {
    const row = this.db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.executionId, executionId))
      .orderBy(desc(workflowRuns.id))
      .limit(1)
      .get();
    return row ? toRun(row) : undefined;
  }

  updateRun(id: string, patch: Partial<Pick<WorkflowRun, "status" | "startedAt" | "endedAt">>) {
    this.db.update(workflowRuns).set(patch).where(eq(workflowRuns.id, id)).run();
  }

  insertNodeRun(row: WorkflowNodeRun): void {
    this.db.insert(workflowNodeRuns).values(row).run();
  }

  updateNodeRun(
    id: string,
    patch: Partial<Pick<WorkflowNodeRun, "status" | "sessionId" | "outputSummary" | "error">>,
  ): void {
    this.db.update(workflowNodeRuns).set(patch).where(eq(workflowNodeRuns.id, id)).run();
  }

  /** Every attempt of a run, oldest first. */
  nodeRuns(runId: string): WorkflowNodeRun[] {
    return this.db
      .select()
      .from(workflowNodeRuns)
      .where(eq(workflowNodeRuns.runId, runId))
      .orderBy(asc(workflowNodeRuns.id))
      .all()
      .map(toNodeRun);
  }

  /** The latest attempt per node. */
  latestNodeRuns(runId: string): WorkflowNodeRun[] {
    const latest = new Map<string, WorkflowNodeRun>();
    for (const r of this.nodeRuns(runId)) {
      const prev = latest.get(r.nodeId);
      if (!prev || r.attempt >= prev.attempt) latest.set(r.nodeId, r);
    }
    return [...latest.values()];
  }
}
