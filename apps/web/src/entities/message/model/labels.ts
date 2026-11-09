import { type MessageType } from "./types";

export const MESSAGE_TYPE_LABEL: Record<MessageType, string> = {
  instruction: "instruction",
  status: "status",
  question: "question",
  answer: "answer",
  review_request: "review request",
  result: "result",
};
