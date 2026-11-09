import { CoinsIcon } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

interface ModelUsageConsentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** what the model will be used for, e.g. "plan generation" */
  purpose: string;
  projectName: string;
  busy?: boolean;
  onConfirm: (rememberForProject: boolean) => void;
}

/**
 * FR-008 consent: say plainly that the step consumes model usage and ask before running it.
 * "Always allow" is stored per project by the server and only when explicitly ticked.
 */
export function ModelUsageConsentDialog({
  open,
  onOpenChange,
  purpose,
  projectName,
  busy = false,
  onConfirm,
}: ModelUsageConsentDialogProps) {
  const [remember, setRemember] = useState(false);
  const rememberId = useId();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-sm sm:max-w-lg">
        <DialogHeader>
          <span className="text-index" aria-hidden="true">
            [usage]
          </span>
          <DialogTitle className="text-display text-lg">Use the model for {purpose}?</DialogTitle>
          <DialogDescription>
            This step sends your task and project context to Claude and{" "}
            <strong className="text-foreground">will consume model usage</strong> on your account.
            The default local analysis did not use the model.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-2 border border-border p-3">
          <Checkbox
            id={rememberId}
            checked={remember}
            onCheckedChange={(v) => setRemember(v === true)}
          />
          <label htmlFor={rememberId} className="font-mono text-xs leading-snug">
            Always allow model usage for <span className="text-phosphor">{projectName}</span>
            <span className="block text-muted-foreground">
              Saved per project; it can be revoked later.
            </span>
          </label>
        </div>
        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="ghost" size="sm" className="rounded-sm">
              Cancel
            </Button>
          </DialogClose>
          <Button
            size="sm"
            className="rounded-sm"
            disabled={busy}
            onClick={() => onConfirm(remember)}
          >
            <CoinsIcon aria-hidden="true" />
            {busy ? "Working…" : "Use model usage"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
