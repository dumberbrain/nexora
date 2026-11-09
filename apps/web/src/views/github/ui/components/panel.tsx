import { useId, type ReactNode } from "react";

import { Tag } from "./tag";

interface PanelProps {
  title: string;
  /** the list came from local `git` because gh could not serve it */
  localGit?: boolean;
  children: ReactNode;
}

/** Bordered terminal section whose heading names the region. */
export function Panel({ title, localGit = false, children }: PanelProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-2 border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={id} className="text-base text-foreground">
          {title}
        </h2>
        {localGit ? (
          <Tag className="border-status-paused/60 text-status-paused">local git</Tag>
        ) : null}
      </div>
      {children}
    </section>
  );
}
