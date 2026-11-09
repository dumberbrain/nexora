import { TriangleAlertIcon } from "lucide-react";

import { type PlanConflict } from "@/entities/task";

const RESOLUTION: Record<PlanConflict["resolution"], string> = {
  serialised: "they will run one after the other",
  separate_worktrees: "they will run in separate worktrees",
};

/** FR-007: tasks that would edit the same files, flagged before anything runs. */
export function ConflictList({ conflicts }: { conflicts: PlanConflict[] }) {
  if (conflicts.length === 0) return null;
  return (
    <section
      aria-label="File conflicts"
      className="flex flex-col gap-1.5 border border-status-paused/60 bg-status-paused/5 p-3"
    >
      <h3 className="flex items-center gap-2 font-mono text-xs text-status-paused uppercase">
        <TriangleAlertIcon className="size-3.5" aria-hidden="true" />
        {conflicts.length} file conflict{conflicts.length === 1 ? "" : "s"} detected
      </h3>
      <ul className="flex flex-col gap-1 font-mono text-xs">
        {conflicts.map((c) => (
          <li key={c.taskIds.join("+")}>
            <span className="text-foreground">{c.taskIds.join(" ↔ ")}</span>
            <span className="text-muted-foreground">
              {" "}
              both edit {c.paths.join(", ")} — {RESOLUTION[c.resolution]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
