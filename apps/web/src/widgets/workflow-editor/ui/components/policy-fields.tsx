import { useId } from "react";
import { type Control, type FieldErrors, type UseFormRegister, useWatch } from "react-hook-form";

import { type WorkflowNode } from "@/entities/workflow";
import { TextField } from "@/shared/ui/form/text-field";

import { LABEL_CLASS, SELECT_CLASS } from "./field-styles";
import { type PropertyFormOutput, type PropertyFormValues } from "../../lib/property-form";

interface PolicyFieldsProps {
  register: UseFormRegister<PropertyFormValues>;
  control: Control<PropertyFormValues, unknown, PropertyFormOutput>;
  errors: FieldErrors<PropertyFormValues>;
  /** possible `goto` targets (every other node) */
  targets: WorkflowNode[];
}

/** Retry policy (maxAttempts ≤ 5, backoff) and the error path: fail | continue | goto(node). */
export function PolicyFields({ register, control, errors, targets }: PolicyFieldsProps) {
  const modeId = useId();
  const targetId = useId();
  const mode = useWatch({ control, name: "onErrorMode" });
  return (
    <fieldset className="flex flex-col gap-3 border-t border-border pt-3">
      <legend className="sr-only">Retry and error handling</legend>
      <div className="grid grid-cols-2 gap-2">
        <TextField
          label="Max attempts"
          type="number"
          min={1}
          max={5}
          error={errors.maxAttempts?.message}
          {...register("maxAttempts", { valueAsNumber: true })}
        />
        <TextField
          label="Backoff (ms)"
          type="number"
          min={0}
          step={100}
          error={errors.backoffMs?.message}
          {...register("backoffMs", { valueAsNumber: true })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={modeId} className={LABEL_CLASS}>
          On error
        </label>
        <select id={modeId} className={SELECT_CLASS} {...register("onErrorMode")}>
          <option value="fail">Fail the workflow</option>
          <option value="continue">Continue</option>
          <option value="goto">Go to node…</option>
        </select>
      </div>
      {mode === "goto" ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={targetId} className={LABEL_CLASS}>
            Error target
          </label>
          <select
            id={targetId}
            className={SELECT_CLASS}
            aria-invalid={errors.onErrorTarget ? true : undefined}
            {...register("onErrorTarget")}
          >
            <option value="">Choose a node…</option>
            {targets.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
          {errors.onErrorTarget ? (
            <p role="alert" className="font-mono text-xs text-destructive">
              {errors.onErrorTarget.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}
