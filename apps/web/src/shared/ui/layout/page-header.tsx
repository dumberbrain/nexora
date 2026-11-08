import { type ReactNode } from "react";

interface PageHeaderProps {
  /** bracket index, e.g. "01" */
  index: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

/** Page title block in the terminal style: [01] index, display heading, muted description. */
export function PageHeader({ index, title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-index" aria-hidden="true">
          [{index}]
        </span>
        <h1 className="text-3xl break-all text-foreground md:text-4xl">{title}</h1>
        {description ? (
          <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
