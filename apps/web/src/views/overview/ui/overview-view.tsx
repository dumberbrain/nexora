import { Link } from "@tanstack/react-router";

import { PageHeader } from "@/shared/ui/layout/page-header";
import { EmptyState } from "@/shared/ui/state";
import { ApprovalsInbox } from "@/widgets/approvals-inbox";
import { OverviewStats } from "@/widgets/overview-stats";
import { SessionTable } from "@/widgets/session-table";

import { ProjectsPanel } from "./components/projects-panel";
import { RECENT_SESSIONS } from "../model/load-overview";

const NOTHING_OBSERVED = (
  <EmptyState
    index="[00]"
    title="No Claude Code sessions observed yet"
    description="Register a project, install the Ubuliera hooks into its Claude Code settings, then run `claude` in that folder. Sessions, agents and events show up here as they happen — nothing on this page is simulated."
  />
);

/** Overview (FR-024): live counters, recent sessions, projects + onboarding. */
export function OverviewView() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        index="01"
        title="Overview"
        description="What your Claude Code sessions and agents are doing right now."
        actions={
          <Link
            to="/executions/new"
            className="border border-phosphor/60 px-3 py-1.5 font-mono text-xs text-phosphor uppercase hover:bg-phosphor/10"
          >
            + new execution
          </Link>
        }
      />
      <OverviewStats />
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <section aria-labelledby="recent-sessions" className="flex min-w-0 flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 id="recent-sessions" className="text-sm tracking-widest">
              Recent sessions
            </h2>
            <Link to="/sessions" className="font-mono text-xs text-phosphor hover:underline">
              all sessions →
            </Link>
          </div>
          <SessionTable
            filters={RECENT_SESSIONS}
            empty={NOTHING_OBSERVED}
            caption="Recent sessions"
          />
        </section>
        <div className="flex min-w-0 flex-col gap-6">
          <ApprovalsInbox />
          <ProjectsPanel />
        </div>
      </div>
    </div>
  );
}
