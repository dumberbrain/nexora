import { PageHeader } from "@/shared/ui/layout/page-header";
import { SessionTable } from "@/widgets/session-table";

/** Sessions (FR-026): every observed / managed Claude Code session, newest activity first. */
export function SessionsView() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        index="03"
        title="Sessions"
        description="Claude Code sessions Ubuliera has seen. Observe-only sessions were started outside Ubuliera and keep their own permissions."
      />
      <SessionTable />
    </div>
  );
}
