import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, XIcon } from "lucide-react";
import { useId } from "react";
import { useForm } from "react-hook-form";

import { type ApprovalRequest } from "@/entities/approval";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";

import {
  type DecisionNote,
  DecisionNoteSchema,
  type DecisionNoteValues,
  useDecideApproval,
} from "../model/use-decide-approval";

interface DecideApprovalFormProps {
  approval: Pick<ApprovalRequest, "id" | "action">;
  onDecided?: (approval: ApprovalRequest) => void;
  className?: string;
}

/** Approve or reject one pending request, with an optional note. Nothing auto-approves. */
export function DecideApprovalForm({ approval, onDecided, className }: DecideApprovalFormProps) {
  const noteId = useId();
  const decide = useDecideApproval(approval.id);
  const form = useForm<DecisionNoteValues, unknown, DecisionNote>({
    resolver: zodResolver(DecisionNoteSchema),
    defaultValues: { note: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const run = (decision: "approve" | "reject") =>
    form.handleSubmit(async ({ note }) => {
      try {
        // not `onDecided?.(await …)`: optional call skips evaluating its argument
        const decided = await decide.mutateAsync({ decision, ...(note ? { note } : {}) });
        onDecided?.(decided);
      } catch (error) {
        const message = error instanceof Error ? error.message : "The decision failed";
        form.setError("root.server", { type: "server", message });
      }
    });

  return (
    <form
      noValidate
      aria-label={`Decide: ${approval.action}`}
      onSubmit={(e) => e.preventDefault()}
      className={cn("flex w-full flex-col gap-2", className)}
    >
      <label htmlFor={noteId} className="font-mono text-[11px] tracking-widest uppercase">
        Note <span className="text-muted-foreground normal-case">(optional)</span>
      </label>
      <Textarea
        id={noteId}
        rows={2}
        aria-invalid={errors.note ? true : undefined}
        className="min-h-12 rounded-sm font-mono text-xs"
        {...form.register("note")}
      />
      {errors.note || errors.root?.server ? (
        <p role="alert" className="font-mono text-xs text-destructive">
          {errors.note?.message ?? errors.root?.server?.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="xs"
          disabled={isSubmitting}
          className="rounded-sm font-mono uppercase"
          onClick={(e) => void run("approve")(e)}
        >
          <CheckIcon aria-hidden="true" />
          Approve
        </Button>
        <Button
          type="button"
          size="xs"
          variant="destructive"
          disabled={isSubmitting}
          className="rounded-sm font-mono uppercase"
          onClick={(e) => void run("reject")(e)}
        >
          <XIcon aria-hidden="true" />
          Reject
        </Button>
      </div>
    </form>
  );
}
