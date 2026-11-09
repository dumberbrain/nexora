import { type ComponentProps, useId } from "react";

import { cn } from "@/shared/lib/cn";
import { Textarea } from "@/shared/ui/textarea";

const LABEL = "font-mono text-[11px] tracking-widest text-muted-foreground uppercase";

function FieldError({ id, error }: { id: string; error: string | undefined }) {
  return error ? (
    <p id={id} role="alert" className="font-mono text-xs text-destructive">
      {error}
    </p>
  ) : null;
}

interface SelectFieldProps extends Omit<ComponentProps<"select">, "id"> {
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}

/** Labelled native select (keyboard + screen-reader friendly). */
export function SelectField({ label, options, className, ...select }: SelectFieldProps) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <select
        id={id}
        className="h-9 rounded-sm border border-input bg-background px-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        {...select}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface TextAreaFieldProps extends Omit<ComponentProps<"textarea">, "id"> {
  label: string;
  hint?: string;
  error?: string | undefined;
}

/** Labelled textarea with accessible hint + error text. */
export function TextAreaField({ label, hint, error, className, ...textarea }: TextAreaFieldProps) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <Textarea
        id={id}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className="rounded-sm font-mono text-sm"
        {...textarea}
      />
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <FieldError id={`${id}-error`} error={error} />
    </div>
  );
}
