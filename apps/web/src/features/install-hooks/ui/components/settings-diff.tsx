import { cn } from "@/shared/lib/cn";
import { diffLines, type DiffLine } from "@/shared/lib/line-diff";

const PREFIX: Record<DiffLine["kind"], string> = { same: " ", add: "+", remove: "-" };
const LABEL: Record<DiffLine["kind"], string> = { same: "", add: "added: ", remove: "removed: " };

interface SettingsDiffProps {
  before: string | null;
  after: string;
}

/** Unified line diff of the settings file — what the install will write, before it is written. */
export function SettingsDiff({ before, after }: SettingsDiffProps) {
  const lines = diffLines(before ?? "", after);
  const added = lines.filter((l) => l.kind === "add").length;
  const removed = lines.filter((l) => l.kind === "remove").length;
  return (
    <figure className="flex min-h-0 flex-col gap-1">
      <figcaption className="font-mono text-[11px] text-muted-foreground">
        <span className="text-status-running">+{added}</span>{" "}
        <span className="text-status-failed">-{removed}</span> lines
      </figcaption>
      <pre
        aria-label="Settings file diff"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard-scrollable (axe scrollable-region-focusable)
        tabIndex={0}
        className="max-h-72 overflow-auto border border-border bg-terminal p-2 font-mono text-xs leading-5"
      >
        {lines.map((line, i) => (
          <div
            key={i}
            className={cn(
              "whitespace-pre",
              line.kind === "add" && "bg-status-running/10 text-status-running",
              line.kind === "remove" && "bg-status-failed/10 text-status-failed",
              line.kind === "same" && "text-muted-foreground",
            )}
          >
            <span aria-hidden="true">{PREFIX[line.kind]} </span>
            <span className="sr-only">{LABEL[line.kind]}</span>
            {line.text}
          </div>
        ))}
      </pre>
    </figure>
  );
}
