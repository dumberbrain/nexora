import { ExecutionConfigSchema } from "@nexora/contracts";
import { z } from "zod";

import { type ExecutionConfig, type Question } from "@/entities/execution";

export type AnswerValues = Record<string, unknown>;

/** Question keys may contain dots (`answers.skills`) — form fields use stable index names. */
export const fieldName = (index: number) => `q${index}`;

const ANSWERS_PREFIX = "answers.";
const CONFIG_KEYS = new Set(Object.keys(ExecutionConfigSchema.shape));

/** Recommended default (FR-005) coerced to the input's value type. */
export function defaultFor(q: Question): unknown {
  const d = q.recommendedDefault;
  switch (q.kind) {
    case "single":
      return typeof d === "string" ? d : (q.options?.[0]?.value ?? "");
    case "multi":
      return Array.isArray(d) ? d.filter((v): v is string => typeof v === "string") : [];
    case "boolean":
      return d === true;
    case "number":
      return typeof d === "number" ? d : (q.min ?? 0);
    case "text":
      return typeof d === "string" ? d : "";
  }
}

export function defaultValues(questions: readonly Question[]): AnswerValues {
  return Object.fromEntries(questions.map((q, i) => [fieldName(i), defaultFor(q)]));
}

function fieldSchema(q: Question): z.ZodType {
  switch (q.kind) {
    case "single":
      return z.string().min(1, "Choose one option");
    case "multi":
      return z.array(z.string());
    case "boolean":
      return z.boolean();
    case "text":
      return z.string().max(2000, "At most 2 000 characters");
    case "number": {
      let n = z.number({ error: "Enter a number" });
      if (q.min !== null) n = n.min(q.min, `At least ${q.min}`);
      if (q.max !== null) n = n.max(q.max, `At most ${q.max}`);
      return n;
    }
  }
}

/** zod schema for exactly the questions the server asked. */
export function answersSchema(questions: readonly Question[]) {
  return z.object(Object.fromEntries(questions.map((q, i) => [fieldName(i), fieldSchema(q)])));
}

/**
 * Merge answers into the execution's config: ExecutionConfig fields by key, `answers.<name>`
 * (and unknown keys) into `config.answers`. Validated by the contract schema.
 */
export function toConfig(
  base: ExecutionConfig,
  questions: readonly Question[],
  values: AnswerValues,
): ExecutionConfig {
  const top: Record<string, unknown> = {};
  const answers: Record<string, unknown> = { ...base.answers };
  questions.forEach((q, i) => {
    const value = values[fieldName(i)];
    if (q.key.startsWith(ANSWERS_PREFIX)) answers[q.key.slice(ANSWERS_PREFIX.length)] = value;
    else if (CONFIG_KEYS.has(q.key) && q.key !== "answers") top[q.key] = value;
    else answers[q.key] = value;
  });
  return ExecutionConfigSchema.parse({ ...base, ...top, answers });
}
