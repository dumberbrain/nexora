import { zodResolver } from "@hookform/resolvers/zod";
import { type ReactNode, useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "../button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../dialog";
import { Textarea } from "../textarea";

interface NoteDialogProps {
  /** the trigger button (rendered via DialogTrigger asChild) */
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  noteLabel: string;
  noteMax: number;
  confirmLabel: string;
  /** resolves when the action succeeded (closes the dialog); rejects to keep it open */
  onConfirm: (note: string | undefined) => Promise<unknown>;
  destructive?: boolean;
}

/** Confirm an action with an optional free-text note/reason (RHF + zod, trimmed, max length). */
export function NoteDialog(props: NoteDialogProps) {
  const { trigger, title, description, noteLabel, noteMax, confirmLabel, onConfirm } = props;
  const [open, setOpen] = useState(false);
  const noteId = useId();
  const schema = z.object({
    note: z.string().trim().max(noteMax, `At most ${noteMax} characters`),
  });
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { note: "" },
  });
  const { errors, isSubmitting } = form.formState;
  const submit = async ({ note }: z.output<typeof schema>) => {
    try {
      await onConfirm(note || undefined);
      form.reset();
      setOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The action failed";
      form.setError("root.server", { type: "server", message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="rounded-sm sm:max-w-md">
        <form noValidate onSubmit={(e) => void form.handleSubmit(submit)(e)}>
          <DialogHeader>
            <DialogTitle className="text-display text-lg">{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="my-4 flex flex-col gap-1">
            <label htmlFor={noteId} className="font-mono text-[11px] tracking-widest uppercase">
              {noteLabel} <span className="text-muted-foreground normal-case">(optional)</span>
            </label>
            <Textarea
              id={noteId}
              rows={3}
              aria-invalid={errors.note ? true : undefined}
              className="rounded-sm font-mono text-sm"
              {...form.register("note")}
            />
            {errors.note ? (
              <p role="alert" className="font-mono text-xs text-destructive">
                {errors.note.message}
              </p>
            ) : null}
          </div>
          {errors.root?.server ? (
            <p role="alert" className="mb-3 font-mono text-xs text-destructive">
              {errors.root.server.message}
            </p>
          ) : null}
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="sm" className="rounded-sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              size="sm"
              variant={props.destructive ? "destructive" : "default"}
              disabled={isSubmitting}
              className="rounded-sm"
            >
              {isSubmitting ? "Working…" : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
