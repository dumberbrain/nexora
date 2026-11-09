import { type ComponentProps, useId } from "react";

import { cn } from "@/shared/lib/cn";

import { Button } from "../button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../tooltip";

interface GuardedButtonProps extends ComponentProps<typeof Button> {
  /** set ⇒ the action is unavailable: shown `aria-disabled` with this reason (FR-031) */
  disabledReason?: string | null | undefined;
}

/**
 * A button that stays visible and focusable when its action is unavailable, explaining why in a
 * tooltip and as its accessible description. The element tree is identical in both states, so
 * focus survives an availability change.
 */
export function GuardedButton({
  disabledReason,
  onClick,
  className,
  ...props
}: GuardedButtonProps) {
  const reasonId = useId();
  const guarded = Boolean(disabledReason);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          {...props}
          aria-disabled={guarded || undefined}
          aria-describedby={guarded ? reasonId : props["aria-describedby"]}
          onClick={(e) => {
            // aria-disabled keeps focus/tooltip working, so block the action (and form submit) here
            if (guarded) e.preventDefault();
            else onClick?.(e);
          }}
          className={cn(guarded && "cursor-not-allowed opacity-50", className)}
        />
      </TooltipTrigger>
      {guarded ? <TooltipContent>{disabledReason}</TooltipContent> : null}
      {guarded ? (
        <span id={reasonId} className="sr-only">
          {disabledReason}
        </span>
      ) : null}
    </Tooltip>
  );
}
