import { type ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

/** Small bordered mono label — the page's badge (text always carries the meaning). */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center border border-border px-1.5 font-mono text-[10px] tracking-widest whitespace-nowrap text-muted-foreground uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}
