import { type Task } from "@nexora/contracts";
import { and, eq } from "drizzle-orm";

import { type Db } from "../../db/client";
import { taskDependencies, tasks } from "../../db/schema";

type Row = typeof tasks.$inferSelect;
type DbTestResults = Row["testResults"];

/** exactOptionalPropertyTypes: drop an undefined reportPath instead of storing it. */
function toDbTestResults(r: Task["testResults"] | undefined): DbTestResults | undefined {
  if (!r) return r;
  const { reportPath, ...counts } = r;
  return reportPath === undefined ? counts : { ...counts, reportPath };
}
const taskNumber = (id: string) => Number(id.slice(2)) || 0;

export type TaskPatch = Partial<
  Pick<
    Task,
    "status" | "agentId" | "changedFiles" | "testResults" | "startedAt" | "completedAt" | "attempt"
  >
>;

/** Tasks + their dependency edges (task_dependencies) for one execution. */
export class TaskRepository {
  constructor(private readonly db: Db) {}

  /** Replace the whole plan of an execution in one transaction. */
  replacePlan(executionId: string, plan: readonly Task[]): void {
    this.db.transaction((tx) => {
      tx.delete(taskDependencies).where(eq(taskDependencies.executionId, executionId)).run();
      tx.delete(tasks).where(eq(tasks.executionId, executionId)).run();
      for (const t of plan) {
        const { dependsOn, testResults, ...row } = t;
        tx.insert(tasks)
          .values({ ...row, testResults: toDbTestResults(testResults) ?? null })
          .run();
        for (const dep of dependsOn) {
          tx.insert(taskDependencies)
            .values({ executionId, taskId: t.id, dependsOnTaskId: dep })
            .run();
        }
      }
    });
  }

  /** Add one task (and its dependency edges) to an existing plan. */
  insert(t: Task): void {
    const { dependsOn, testResults, ...row } = t;
    this.db.transaction((tx) => {
      tx.insert(tasks)
        .values({ ...row, testResults: toDbTestResults(testResults) ?? null })
        .run();
      for (const dep of dependsOn) {
        tx.insert(taskDependencies)
          .values({ executionId: t.executionId, taskId: t.id, dependsOnTaskId: dep })
          .run();
      }
    });
  }

  list(executionId: string): Task[] {
    const deps = this.db
      .select()
      .from(taskDependencies)
      .where(eq(taskDependencies.executionId, executionId))
      .all();
    const byTask = new Map<string, string[]>();
    for (const d of deps)
      byTask.set(d.taskId, [...(byTask.get(d.taskId) ?? []), d.dependsOnTaskId]);
    return this.db
      .select()
      .from(tasks)
      .where(eq(tasks.executionId, executionId))
      .all()
      .map((r) => this.toTask(r, byTask.get(r.id) ?? []))
      .sort((a, b) => taskNumber(a.id) - taskNumber(b.id));
  }

  get(executionId: string, id: string): Task | undefined {
    return this.list(executionId).find((t) => t.id === id);
  }

  update(executionId: string, id: string, patch: TaskPatch): void {
    const { testResults, ...rest } = patch;
    this.db
      .update(tasks)
      .set({
        ...rest,
        ...("testResults" in patch ? { testResults: toDbTestResults(testResults) ?? null } : {}),
      })
      .where(and(eq(tasks.executionId, executionId), eq(tasks.id, id)))
      .run();
  }

  private toTask(r: Row, dependsOn: string[]): Task {
    return {
      ...r,
      testResults: r.testResults ?? null,
      dependsOn: dependsOn.sort((a, b) => taskNumber(a) - taskNumber(b)),
    };
  }
}
