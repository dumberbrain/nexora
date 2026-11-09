import { BYPASS_CONFIRMATION_PHRASE } from "@nexora/contracts";
import { useId, type ComponentProps } from "react";

import { Input } from "@/shared/ui/input";
import { Switch } from "@/shared/ui/switch";

interface BypassSectionProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  /** register("bypassConfirmation") */
  confirmationInput: Omit<ComponentProps<"input">, "id">;
  error?: string | undefined;
}

/**
 * FR-053: permission bypass is OFF by default; turning it on requires typing the exact
 * confirmation phrase for this one execution.
 */
export function BypassSection({
  enabled,
  onEnabledChange,
  confirmationInput,
  error,
}: BypassSectionProps) {
  const id = useId();
  return (
    <section
      aria-label="Permission bypass"
      className="flex flex-col gap-2 border border-dashed border-status-failed/50 p-3"
    >
      <div className="flex items-start gap-3">
        <Switch
          id={`${id}-switch`}
          checked={enabled}
          onCheckedChange={onEnabledChange}
          aria-describedby={`${id}-hint`}
        />
        <div className="flex flex-col gap-0.5">
          <label htmlFor={`${id}-switch`} className="font-mono text-xs uppercase">
            Bypass agent permission prompts
          </label>
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            Agents would run tools without asking. Off by default — applies to this execution only.
          </p>
        </div>
      </div>
      {enabled ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-phrase`} className="font-mono text-xs">
            Type <span className="text-status-failed">{BYPASS_CONFIRMATION_PHRASE}</span> to confirm
          </label>
          <Input
            id={`${id}-phrase`}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className="max-w-xs rounded-sm font-mono"
            {...confirmationInput}
          />
          {error ? (
            <p id={`${id}-error`} role="alert" className="font-mono text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
