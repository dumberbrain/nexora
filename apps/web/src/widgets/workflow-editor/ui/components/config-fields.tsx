import { RISK_CLASSES } from "@nexora/contracts";
import { useId } from "react";
import { type FieldErrors, type UseFormRegister } from "react-hook-form";

import { humanize } from "@/shared/lib/humanize";
import { TextField } from "@/shared/ui/form/text-field";
import { Textarea } from "@/shared/ui/textarea";

import { LABEL_CLASS, SELECT_CLASS } from "./field-styles";
import { type FieldSpec, type PropertyFormValues } from "../../lib/property-form";

interface ConfigFieldsProps {
  fields: FieldSpec[];
  register: UseFormRegister<PropertyFormValues>;
  errors: FieldErrors<PropertyFormValues>;
}

/** The kind-specific config inputs of the selected node. */
export function ConfigFields({ fields, register, errors }: ConfigFieldsProps) {
  return (
    <>
      {fields.map((f) => {
        const error = errors.config?.[f.name]?.message;
        const name = `config.${f.name}` as const;
        if (f.type === "text") {
          return (
            <TextField
              key={f.name}
              label={f.label}
              error={error}
              {...(f.hint ? { hint: f.hint } : {})}
              {...register(name)}
            />
          );
        }
        return <OtherField key={f.name} spec={f} error={error} register={register} />;
      })}
    </>
  );
}

interface OtherFieldProps {
  spec: FieldSpec;
  error: string | undefined;
  register: UseFormRegister<PropertyFormValues>;
}

function OtherField({ spec, error, register }: OtherFieldProps) {
  const id = useId();
  const described = [spec.hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");
  const common = {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": described || undefined,
    ...register(`config.${spec.name}`),
  };
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={LABEL_CLASS}>
        {spec.label}
      </label>
      {spec.type === "risk" ? (
        <select className={SELECT_CLASS} {...common}>
          {RISK_CLASSES.values.map((r) => (
            <option key={r} value={r}>
              {humanize(r)}
            </option>
          ))}
        </select>
      ) : (
        <Textarea
          rows={spec.type === "lines" ? 2 : 4}
          className="rounded-sm font-mono text-sm"
          {...common}
        />
      )}
      {spec.hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {spec.hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="font-mono text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
