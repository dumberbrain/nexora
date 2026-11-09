import { zodResolver } from "@hookform/resolvers/zod";
import { SendIcon } from "lucide-react";
import { useId } from "react";
import { useForm } from "react-hook-form";

import { cn } from "@/shared/lib/cn";
import { GuardedButton } from "@/shared/ui/control/guarded-button";
import { Textarea } from "@/shared/ui/textarea";

import { messageBlockedReason, type MessageTarget, targetName } from "../lib/message-target";
import {
  SendMessageFormSchema,
  type SendMessageFormValues,
  type SendMessageValues,
  useSendMessage,
} from "../model/use-send-message";

interface SendMessageFormProps {
  target: MessageTarget;
  className?: string;
}

/** Send user-visible text to a running agent (FR-027). Gated by the session's capabilities. */
export function SendMessageForm({ target, className }: SendMessageFormProps) {
  const id = useId();
  const send = useSendMessage(target);
  const blocked = messageBlockedReason(target);
  const form = useForm<SendMessageFormValues, unknown, SendMessageValues>({
    resolver: zodResolver(SendMessageFormSchema),
    defaultValues: { text: "" },
  });
  const { errors, isSubmitting, isSubmitSuccessful } = form.formState;
  const submit = async (values: SendMessageValues) => {
    try {
      await send.mutateAsync(values);
      form.reset({ text: "" }, { keepIsSubmitSuccessful: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sending failed";
      form.setError("root.server", { type: "server", message });
    }
  };
  const error = errors.text?.message ?? errors.root?.server?.message;

  return (
    <form
      noValidate
      aria-label="Send message"
      onSubmit={(e) => void form.handleSubmit(submit)(e)}
      className={cn("flex flex-col gap-2", className)}
    >
      <label htmlFor={id} className="font-mono text-[11px] tracking-widest uppercase">
        Message to {targetName(target)}
      </label>
      <Textarea
        id={id}
        rows={3}
        disabled={blocked !== null}
        aria-invalid={errors.text ? true : undefined}
        className="rounded-sm font-mono text-sm"
        placeholder="Only this text is sent — agents' private reasoning is never shown."
        {...form.register("text")}
      />
      {error ? (
        <p role="alert" className="font-mono text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <GuardedButton
          type="submit"
          size="xs"
          className="rounded-sm font-mono uppercase"
          disabledReason={blocked}
          disabled={isSubmitting}
        >
          <SendIcon aria-hidden="true" />
          Send message
        </GuardedButton>
        <p role="status" className="font-mono text-[11px] text-status-completed">
          {isSubmitSuccessful && !error ? "Message sent" : ""}
        </p>
      </div>
    </form>
  );
}
