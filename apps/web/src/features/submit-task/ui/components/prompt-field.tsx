import { useId, type ComponentProps } from "react";

import { cn } from "@/shared/lib/cn";
import { Textarea } from "@/shared/ui/textarea";

import { PROMPT_MAX } from "../../model/submit-task.schema";

interface PromptFieldProps extends Omit<ComponentProps<"textarea">, "id"> {
  /** current value length, for the live counter */
  length: number;
  error?: string | undefined;
}

/** Task prompt textarea with a character counter (1–20 000) and accessible error text. */
export function PromptField({ length, error, className, ...textarea }: PromptFieldProps) {
  const id = useId();
  const countId = `${id}-count`;
  const errorId = `${id}-error`;
  const over = length > PROMPT_MAX;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label
        htmlFor={id}
        className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase"
      >
        Task description
      </label>
      <Textarea
        id={id}
        rows={8}
        aria-invalid={error ? true : undefined}
        aria-describedby={[countId, error ? errorId : null].filter(Boolean).join(" ")}
        className="min-h-40 rounded-sm font-mono text-sm"
        {...textarea}
      />
      <div className="flex justify-between gap-3">
        {error ? (
          <p id={errorId} role="alert" className="font-mono text-xs text-destructive">
            {error}
          </p>
        ) : (
          <span />
        )}
        <p
          id={countId}
          className={cn(
            "font-mono text-[11px] tabular-nums",
            over ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {length.toLocaleString("en-US")} / {PROMPT_MAX.toLocaleString("en-US")} characters
        </p>
      </div>
    </div>
  );
}
