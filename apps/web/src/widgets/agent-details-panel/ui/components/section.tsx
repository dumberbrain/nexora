import { type ReactNode } from "react";

interface SectionProps {
  index: string;
  title: string;
  children: ReactNode;
}

/** Bracket-indexed panel section. */
export function Section({ index, title, children }: SectionProps) {
  const id = `agent-section-${index}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2 border-t border-border pt-3">
      <h3 id={id} className="flex items-baseline gap-2 text-xs tracking-widest text-foreground">
        <span className="text-index" aria-hidden="true">
          [{index}]
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}
