import { type UseFormRegister } from "react-hook-form";

import { type Question } from "@/entities/execution";
import { Input } from "@/shared/ui/input";

import { type AnswerValues } from "../../lib/questions";

interface QuestionFieldProps {
  question: Question;
  name: string;
  register: UseFormRegister<AnswerValues>;
  error?: string | undefined;
}

const LEGEND = "font-mono text-xs text-foreground";
const CHOICE = "flex items-start gap-2 font-mono text-xs";

/** One follow-up question rendered by kind; the recommended default is pre-filled. */
export function QuestionField({ question: q, name, register, error }: QuestionFieldProps) {
  const helpId = `${name}-help`;
  const errorId = `${name}-error`;
  const describedBy = [q.help ? helpId : null, error ? errorId : null].filter(Boolean).join(" ");
  const aria = {
    "aria-describedby": describedBy || undefined,
    "aria-invalid": error ? true : undefined,
  } as const;

  return (
    <fieldset className="flex flex-col gap-1.5 border border-border bg-card p-3">
      <legend className={LEGEND}>{q.label}</legend>
      {q.help ? (
        <p id={helpId} className="text-xs text-muted-foreground">
          {q.help}
        </p>
      ) : null}
      {q.kind === "single" || q.kind === "multi"
        ? (q.options ?? []).map((o) => (
            <label key={o.value} className={CHOICE}>
              <input
                type={q.kind === "single" ? "radio" : "checkbox"}
                value={o.value}
                className="mt-0.5 accent-(--phosphor)"
                {...aria}
                {...register(name)}
              />
              <span>
                {o.label}
                {o.description ? (
                  <span className="block text-muted-foreground">{o.description}</span>
                ) : null}
              </span>
            </label>
          ))
        : null}
      {q.kind === "boolean" ? (
        <label className={CHOICE}>
          <input
            type="checkbox"
            className="mt-0.5 accent-(--phosphor)"
            {...aria}
            {...register(name)}
          />
          <span>Yes</span>
        </label>
      ) : null}
      {q.kind === "number" ? (
        <Input
          type="number"
          aria-label={q.label}
          className="max-w-32 rounded-sm font-mono"
          {...(q.min !== null ? { min: q.min } : {})}
          {...(q.max !== null ? { max: q.max } : {})}
          {...aria}
          {...register(name, { valueAsNumber: true })}
        />
      ) : null}
      {q.kind === "text" ? (
        <Input
          type="text"
          aria-label={q.label}
          className="rounded-sm font-mono"
          {...aria}
          {...register(name)}
        />
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="font-mono text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
