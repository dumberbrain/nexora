import { STRATEGIES } from "@nexora/contracts";
import { useId, type ComponentProps } from "react";

import { STRATEGY_LABEL } from "@/entities/execution";

interface StrategyFieldProps extends Omit<ComponentProps<"select">, "id"> {
  error?: string | undefined;
}

/** Development strategy (FR-004) — native select over STRATEGIES. */
export function StrategyField({ error, ...select }: StrategyFieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase"
      >
        Strategy
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        className="h-9 max-w-xs rounded-sm border border-input bg-background px-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        {...select}
      >
        {STRATEGIES.values.map((s) => (
          <option key={s} value={s}>
            {STRATEGY_LABEL[s]}
          </option>
        ))}
      </select>
      {error ? (
        <p role="alert" className="font-mono text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
