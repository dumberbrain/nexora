import { SquareIcon } from "lucide-react";

import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

export type ControlTarget = "session" | "execution";

const CONSEQUENCE: Record<ControlTarget, string> = {
  session: "The runtime ends this session within about 5 seconds; its current turn is lost.",
  execution:
    "Every runtime of this execution stops within about 5 seconds and queued tasks are cancelled.",
};

interface StopConfirmDialogProps {
  target: ControlTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onConfirm: () => void;
}

/** Stop is not undoable — always confirm it explicitly. */
export function StopConfirmDialog({
  target,
  open,
  onOpenChange,
  busy,
  onConfirm,
}: StopConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-sm sm:max-w-md">
        <DialogHeader>
          <span className="text-index" aria-hidden="true">
            [stop]
          </span>
          <DialogTitle className="text-display text-lg">Stop this {target}?</DialogTitle>
          <DialogDescription>{CONSEQUENCE[target]}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="ghost" size="sm" className="rounded-sm">
              Keep running
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            size="sm"
            className="rounded-sm"
            disabled={busy}
            onClick={onConfirm}
          >
            <SquareIcon aria-hidden="true" />
            {busy ? "Stopping…" : "Stop now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
