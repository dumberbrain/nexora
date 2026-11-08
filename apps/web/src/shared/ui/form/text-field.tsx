import { useId, type ComponentProps } from "react";

import { cn } from "@/shared/lib/cn";

import { Input } from "../input";

interface TextFieldProps extends Omit<ComponentProps<"input">, "id"> {
  label: string;
  /** validation message — wired to aria-invalid / aria-describedby */
  error?: string | undefined;
  hint?: string;
}

/** Labelled input with accessible hint + error text (react-hook-form `register` spreads in). */
export function TextField({ label, error, hint, className, ...input }: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label
        htmlFor={id}
        className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase"
      >
        {label}
      </label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className="rounded-sm font-mono"
        {...input}
      />
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="font-mono text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
