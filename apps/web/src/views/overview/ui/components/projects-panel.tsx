import { useQuery } from "@tanstack/react-query";

import { HooksStatusTag, projectListQuery } from "@/entities/project";
import { InstallHooksDialog } from "@/features/install-hooks";
import { ModelConsentStatus } from "@/features/manage-model-consent";
import { RegisterProjectForm } from "@/features/register-project";
import { ErrorState, LoadingState } from "@/shared/ui/state";

/** Registered projects with their hook status + register / install CTAs. */
export function ProjectsPanel() {
  const projects = useQuery(projectListQuery());

  return (
    <section
      aria-labelledby="projects-title"
      className="flex flex-col gap-3 border border-border bg-card p-4"
    >
      <div className="flex items-baseline gap-2">
        <span className="text-index" aria-hidden="true">
          [p]
        </span>
        <h2 id="projects-title" className="text-sm tracking-widest">
          Projects
        </h2>
      </div>
      {projects.isPending ? <LoadingState label="Loading projects" rows={2} /> : null}
      {projects.isError ? (
        <ErrorState
          title="Projects unavailable"
          error={projects.error}
          onRetry={() => void projects.refetch()}
        />
      ) : null}
      {projects.data?.items.length === 0 ? (
        <p className="font-mono text-xs text-muted-foreground">No project registered yet.</p>
      ) : null}
      {projects.data && projects.data.items.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border">
          {projects.data.items.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="flex min-w-0 flex-col">
                <span className="text-sm text-foreground">{p.name}</span>
                <span
                  className="truncate font-mono text-[11px] text-muted-foreground"
                  title={p.rootPath}
                >
                  {p.rootPath}
                </span>
                <ModelConsentStatus project={p} />
              </div>
              <div className="flex items-center gap-2">
                <HooksStatusTag installed={p.hooksInstalled} />
                <InstallHooksDialog project={p} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <RegisterProjectForm className="border-t border-border pt-3" />
    </section>
  );
}
