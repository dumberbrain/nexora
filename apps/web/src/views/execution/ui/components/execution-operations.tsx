import { type Execution } from "@/entities/execution";
import { AssignTaskForm } from "@/features/assign-task";
import { ApprovalsInbox } from "@/widgets/approvals-inbox";

const ASSIGNABLE: ReadonlySet<Execution["status"]> = new Set(["running", "paused"]);

/** Assign an additional task (while it runs) + this execution's pending approvals (US3). */
export function ExecutionOperations({ execution }: { execution: Execution }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {ASSIGNABLE.has(execution.status) ? (
        <section
          aria-labelledby="assign-task"
          className="flex flex-col gap-3 border border-border bg-card p-4"
        >
          <h2 id="assign-task" className="text-sm tracking-widest">
            Assign an additional task
          </h2>
          <AssignTaskForm executionId={execution.id} />
        </section>
      ) : null}
      <ApprovalsInbox executionId={execution.id} />
    </div>
  );
}
