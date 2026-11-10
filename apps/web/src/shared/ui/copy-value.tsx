import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/shared/lib/cn";

import { Button } from "./button";

const RESET_MS = 2_000;

interface CopyValueProps {
  value: string;
  /** accessible name of the copy button, e.g. "Copy token secret" */
  copyLabel: string;
  /** terminal prompt glyph shown before the value (e.g. "$" for a shell command) */
  prompt?: string;
  className?: string;
}

/** A value in a terminal well with a copy-to-clipboard button (feedback via aria-live). */
export function CopyValue({ value, copyLabel, prompt, className }: CopyValueProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), RESET_MS);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className={cn("flex items-start gap-2 border border-border bg-terminal px-3 py-2", className)}
    >
      {prompt ? (
        <span aria-hidden="true" className="pt-0.5 font-mono text-xs text-phosphor">
          {prompt}
        </span>
      ) : null}
      <code className="flex-1 font-mono text-sm break-all text-foreground select-all">{value}</code>
      <Button variant="ghost" size="icon-sm" aria-label={copyLabel} onClick={() => void copy()}>
        {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </div>
  );
}
