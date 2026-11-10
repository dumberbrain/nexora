import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SendMessageInputSchema } from "@ubuliera/contracts";
import { z } from "zod";

import { agentApi } from "@/entities/agent";
import { messageKeys } from "@/entities/message";
import { sessionApi } from "@/entities/session";

import { type MessageTarget } from "../lib/message-target";

export const MESSAGE_MAX = 8000;

/** Form shape = SendMessageInputSchema with user-facing messages. */
export const SendMessageFormSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Write a message first")
    .max(MESSAGE_MAX, "At most 8 000 characters")
    .pipe(SendMessageInputSchema.shape.text),
});
export type SendMessageFormValues = z.input<typeof SendMessageFormSchema>;
export type SendMessageValues = z.output<typeof SendMessageFormSchema>;

/** POST /sessions/:id/messages or /agents/:id/messages → refresh the Communication Center. */
export function useSendMessage(target: MessageTarget) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SendMessageValues) =>
      target.kind === "session"
        ? sessionApi.sendMessage(target.session.id, input)
        : agentApi.sendMessage(target.agent.id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: messageKeys.lists() }),
  });
}
