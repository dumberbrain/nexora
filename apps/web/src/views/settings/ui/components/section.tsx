import { useId, type ReactNode } from "react";

interface SectionProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}

/** Bordered terminal section whose heading names the region. */
export function Section({ title, description, children }: SectionProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-4 border border-border p-4">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-lg text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
