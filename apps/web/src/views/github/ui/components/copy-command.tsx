import { CheckIcon, CopyIcon } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/shared/ui/button";

const RESET_MS = 2_000;

/** A shell command the user runs themselves, with a copy-to-clipboard button. */
export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), RESET_MS);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex items-center gap-2 border border-border bg-terminal px-3 py-2">
      <span aria-hidden="true" className="font-mono text-xs text-phosphor">
        $
      </span>
      <code className="flex-1 font-mono text-sm break-all text-foreground">{command}</code>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`${copied ? "Copied" : "Copy"} ${command}`}
        onClick={() => void copy()}
      >
        {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
      </Button>
    </div>
  );
}
