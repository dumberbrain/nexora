import { cn } from "@/shared/lib/cn";

interface HooksStatusTagProps {
  installed: boolean;
  className?: string;
}

/** Whether Nexora's observation hooks are installed in the project's Claude Code settings. */
export function HooksStatusTag({ installed, className }: HooksStatusTagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[10px] tracking-wider uppercase",
        installed
          ? "border-phosphor/50 bg-phosphor/10 text-phosphor"
          : "border-dashed border-border text-muted-foreground",
        className,
      )}
    >
      <span aria-hidden="true">{installed ? "●" : "○"}</span>
      {installed ? "hooks installed" : "hooks not installed"}
    </span>
  );
}
