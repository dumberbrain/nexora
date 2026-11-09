import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightIcon } from "lucide-react";
import { useForm, type DefaultValues } from "react-hook-form";

import { type Execution, type ModeOption } from "@/entities/execution";
import { Button } from "@/shared/ui/button";

import { ModeCard } from "./mode-card";
import { StrategyField } from "./strategy-field";
import {
  ChooseModeFormSchema,
  DEFAULT_STRATEGY,
  initialMode,
  type ChooseModeFormValues,
} from "../../model/choose-mode.schema";
import { useChooseMode } from "../../model/use-choose-mode";

interface ModeFormProps {
  execution: Execution;
  options: ModeOption[];
  onChosen: (execution: Execution) => void;
}

/** Radio cards for the mode + strategy select; PUT only on explicit submit. */
export function ModeForm({ execution, options, onChosen }: ModeFormProps) {
  const mode = initialMode(execution, options);
  const defaultValues: DefaultValues<ChooseModeFormValues> = {
    strategy: execution.strategy ?? DEFAULT_STRATEGY,
    ...(mode ? { mode } : {}),
  };
  const form = useForm<ChooseModeFormValues>({
    resolver: zodResolver(ChooseModeFormSchema),
    defaultValues,
  });
  const choose = useChooseMode(execution.id);
  const { errors, isSubmitting } = form.formState;

  const submit = async (values: ChooseModeFormValues) => {
    try {
      onChosen(await choose.mutateAsync(values));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Saving the mode failed";
      form.setError("root.server", { type: "server", message });
    }
  };

  return (
    <form
      noValidate
      aria-label="Choose execution mode"
      onSubmit={(e) => void form.handleSubmit(submit)(e)}
      className="flex flex-col gap-4"
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
          Execution mode
        </legend>
        {options.map((o) => (
          <ModeCard key={o.mode} option={o} {...form.register("mode")} />
        ))}
        {errors.mode ? (
          <p role="alert" className="font-mono text-xs text-destructive">
            {errors.mode.message}
          </p>
        ) : null}
      </fieldset>
      <StrategyField error={errors.strategy?.message} {...form.register("strategy")} />
      {errors.root?.server ? (
        <p role="alert" className="font-mono text-xs text-destructive">
          {errors.root.server.message}
        </p>
      ) : null}
      <Button type="submit" size="sm" disabled={isSubmitting} className="self-start rounded-sm">
        {isSubmitting ? "Saving…" : "Use this mode"}
        <ArrowRightIcon aria-hidden="true" />
      </Button>
    </form>
  );
}
