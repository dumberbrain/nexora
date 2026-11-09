import { MAX_RETRY_ATTEMPTS, NODE_CONFIG_SCHEMAS } from "@nexora/contracts";
import { z } from "zod";

import { type OnError, type WorkflowNode, type WorkflowNodeKind } from "@/entities/workflow";

export interface FieldSpec {
  name: string;
  label: string;
  /** text = input, long = textarea, lines = one value per line → string[], risk = risk class */
  type: "text" | "long" | "lines" | "risk";
  optional?: boolean;
  hint?: string;
}

/** Property-panel fields per kind; the contract's NODE_CONFIG_SCHEMAS validates the result. */
export const CONFIG_FIELDS: Partial<Record<WorkflowNodeKind, FieldSpec[]>> = {
  agent: [
    { name: "role", label: "Role", type: "text", hint: "built-in role or a project agent name" },
    { name: "prompt", label: "Prompt", type: "long" },
    {
      name: "ownedPaths",
      label: "Owned paths",
      type: "lines",
      optional: true,
      hint: "one glob per line — empty means the whole worktree",
    },
  ],
  skill: [
    { name: "skill", label: "Skill", type: "text", hint: "an executable (user-invocable) skill" },
    { name: "args", label: "Arguments", type: "text", optional: true },
  ],
  mcp_tool: [
    { name: "server", label: "MCP server", type: "text" },
    { name: "tool", label: "Tool", type: "text" },
    { name: "prompt", label: "Prompt", type: "long" },
  ],
  condition: [
    {
      name: "expression",
      label: "Expression",
      type: "text",
      hint: 'e.g. nodes.tests.status == "completed"',
    },
  ],
  approval: [
    { name: "message", label: "Message", type: "long" },
    { name: "riskClass", label: "Risk class", type: "risk" },
  ],
};

export const ON_ERROR_MODES = ["fail", "continue", "goto"] as const;

export interface PropertyFormValues {
  label: string;
  config: Record<string, string>;
  maxAttempts: number;
  backoffMs: number;
  onErrorMode: (typeof ON_ERROR_MODES)[number];
  onErrorTarget: string;
}

export function toFormValues(node: WorkflowNode): PropertyFormValues {
  const fields = CONFIG_FIELDS[node.kind] ?? [];
  const config = Object.fromEntries(
    fields.map((f) => {
      const raw = node.config[f.name];
      const text = Array.isArray(raw) ? raw.join("\n") : typeof raw === "string" ? raw : "";
      return [f.name, text];
    }),
  );
  return {
    label: node.label,
    config,
    maxAttempts: node.retry.maxAttempts,
    backoffMs: node.retry.backoffMs,
    onErrorMode: typeof node.onError === "object" ? "goto" : node.onError,
    onErrorTarget: typeof node.onError === "object" ? node.onError.goto : "",
  };
}

const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/** RHF + zod schema of one node kind → the node fields to patch. */
export function propertySchema(kind: WorkflowNodeKind) {
  const fields = CONFIG_FIELDS[kind] ?? [];
  const contract = NODE_CONFIG_SCHEMAS[kind] as unknown as z.ZodType<
    Record<string, unknown>,
    Record<string, unknown>
  >;
  const config = z
    .object(
      Object.fromEntries(
        fields.map((f) => [
          f.name,
          f.optional ? z.string() : z.string().trim().min(1, `${f.label} is required`),
        ]),
      ),
    )
    .transform((raw): Record<string, unknown> =>
      Object.fromEntries(
        fields.map((f) => [f.name, f.type === "lines" ? lines(raw[f.name] ?? "") : raw[f.name]]),
      ),
    )
    .pipe(contract);

  return z
    .object({
      label: z.string().trim().min(1, "Label is required").max(120, "At most 120 characters"),
      config,
      maxAttempts: z
        .number({ error: "Enter a number" })
        .int("Whole attempts only")
        .min(1, "At least 1 attempt")
        .max(MAX_RETRY_ATTEMPTS, `At most ${MAX_RETRY_ATTEMPTS} attempts`),
      backoffMs: z
        .number({ error: "Enter a number" })
        .int("Whole milliseconds only")
        .min(0, "Cannot be negative")
        .max(600_000, "At most 600 000 ms"),
      onErrorMode: z.enum(ON_ERROR_MODES),
      onErrorTarget: z.string(),
    })
    .refine((v) => v.onErrorMode !== "goto" || v.onErrorTarget !== "", {
      path: ["onErrorTarget"],
      message: "Choose the node to go to",
    })
    .transform((v) => ({
      label: v.label,
      config: v.config,
      retry: { maxAttempts: v.maxAttempts, backoffMs: v.backoffMs },
      onError: (v.onErrorMode === "goto" ? { goto: v.onErrorTarget } : v.onErrorMode) as OnError,
    }));
}

export type PropertyFormOutput = z.output<ReturnType<typeof propertySchema>>;
