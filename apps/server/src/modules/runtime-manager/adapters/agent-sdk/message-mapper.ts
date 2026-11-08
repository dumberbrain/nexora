import { type Usage } from "@nexora/contracts";
import { z } from "zod";

import { type EventInput } from "../../../event-manager";
import { displayPath, toolSummary } from "../../../event-manager/normalizers/hook-normalizer";
import {
  type EventSink,
  FILE_WRITE_TOOLS,
  type SessionResult,
} from "../../runtime-adapter";

/**
 * SDK / stream-json message → NexoraEvent mapper (T085, research S3). Shared by the Agent SDK and
 * the CLI headless adapter: both emit the same message shapes. Messages are untrusted JSON and
 * parsed defensively; unknown types (rate_limit_event, system/commands_changed, hook/task
 * progress …) are ignored.
 */

export interface MapperContext {
  executionId: string;
  taskId: string | null;
  source: "agent_sdk" | "stream_json";
}

export type MapperSignal =
  | { kind: "init"; sessionId: string; model: string | null; cwd: string; first: boolean }
  | { kind: "result"; result: SessionResult };

const SPAWN_TOOLS = new Set(["Agent", "Task"]);
const MAX_SUMMARY_PAYLOAD = 4000;

const InitSchema = z.looseObject({
  type: z.literal("system"),
  subtype: z.literal("init"),
  session_id: z.string().min(1).max(128),
  cwd: z.string().min(1),
  model: z.string().optional(),
});

const ToolUseBlock = z.looseObject({
  type: z.literal("tool_use"),
  id: z.string().min(1),
  name: z.string().min(1),
  input: z.record(z.string(), z.unknown()).catch({}),
});
const TextBlock = z.looseObject({ type: z.literal("text"), text: z.string() });
const ToolResultBlock = z.looseObject({
  type: z.literal("tool_result"),
  tool_use_id: z.string().min(1),
  is_error: z.boolean().optional(),
  content: z.unknown().optional(),
});
const Block = z.union([ToolUseBlock, TextBlock, ToolResultBlock, z.looseObject({})]);

const ConversationSchema = z.looseObject({
  type: z.enum(["assistant", "user"]),
  parent_tool_use_id: z.string().nullable().optional(),
  message: z.looseObject({ content: z.union([z.string(), z.array(Block)]) }),
  tool_use_result: z.unknown().optional(),
});

const ModelUsageEntry = z.looseObject({
  inputTokens: z.number().nonnegative().catch(0),
  outputTokens: z.number().nonnegative().catch(0),
  cacheReadInputTokens: z.number().nonnegative().catch(0),
  cacheCreationInputTokens: z.number().nonnegative().catch(0),
});
const ResultSchema = z.looseObject({
  type: z.literal("result"),
  subtype: z.string(),
  is_error: z.boolean().optional(),
  session_id: z.string().optional(),
  result: z.string().optional(),
  errors: z.array(z.unknown()).optional(),
  total_cost_usd: z.number().nonnegative().optional(),
  num_turns: z.number().optional(),
  duration_ms: z.number().optional(),
  modelUsage: z.record(z.string(), ModelUsageEntry).optional(),
});

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  /** caller: null = main agent, else the parent Agent tool_use id */
  agentId: string | null;
}

type Conversation = z.infer<typeof ConversationSchema>;

/**
 * Usage = sum over `modelUsage` (S3: covers subagents, `usage` covers only the main loop).
 * Input tokens include cache reads/writes. Values are cumulative per session.
 */
export function usageOf(result: z.infer<typeof ResultSchema>): Usage | null {
  const models = Object.values(result.modelUsage ?? {});
  if (models.length === 0 && result.total_cost_usd === undefined) return null;
  let inputTokens = 0;
  let outputTokens = 0;
  for (const m of models) {
    inputTokens += m.inputTokens + m.cacheReadInputTokens + m.cacheCreationInputTokens;
    outputTokens += m.outputTokens;
  }
  return {
    inputTokens: Math.round(inputTokens),
    outputTokens: Math.round(outputTokens),
    costUsd: result.total_cost_usd ?? null,
    costIsEstimate: true,
  };
}

function textOf(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const parts = content
    .map((b) => TextBlock.safeParse(b))
    .filter((r) => r.success)
    .map((r) => r.data.text);
  return parts.length ? parts.join("\n") : null;
}

const clip = (s: string | null) =>
  s && s.length > MAX_SUMMARY_PAYLOAD ? `${s.slice(0, MAX_SUMMARY_PAYLOAD - 1)}…` : s;

export class MessageMapper {
  private sessionId: string | null = null;
  private cwd: string | undefined;
  private initSeen = false;
  private interruptRequested = false;
  private lastText: string | null = null;
  private readonly tools = new Map<string, ToolCall>();

  constructor(
    private readonly ctx: MapperContext,
    private readonly sink: EventSink,
    /** observe tool calls as they stream (the CLI adapter's best-effort scope check) */
    private readonly onToolUse?: (call: { toolUseId: string } & ToolCall) => void,
  ) {}

  /** Our own interrupt() is in flight: the next error result means "interrupted" (S3). */
  markInterrupted(): void {
    this.interruptRequested = true;
  }

  map(raw: unknown): MapperSignal | null {
    if (typeof raw !== "object" || raw === null) return null;
    const type = (raw as { type?: unknown }).type;
    switch (type) {
      case "system":
        return this.init(raw);
      case "assistant":
      case "user": {
        const parsed = ConversationSchema.safeParse(raw);
        if (parsed.success) this.conversation(parsed.data);
        return null;
      }
      case "result": {
        const parsed = ResultSchema.safeParse(raw);
        return parsed.success ? this.result(parsed.data) : null;
      }
      default:
        return null;
    }
  }

  private init(raw: object): MapperSignal | null {
    const parsed = InitSchema.safeParse(raw);
    if (!parsed.success) return null;
    const { session_id: sessionId, cwd } = parsed.data;
    const model = parsed.data.model ?? null;
    const first = !this.initSeen;
    this.initSeen = true;
    this.sessionId = sessionId;
    this.cwd = cwd;
    if (first) {
      this.emit({
        type: "session.started",
        reliability: "authoritative",
        severity: "info",
        agentId: null,
        summary: `Session started${model ? ` (${model})` : ""}`,
        payload: { model, cwd, permissionMode: (raw as { permissionMode?: unknown }).permissionMode },
      });
    }
    return { kind: "init", sessionId, model, cwd, first };
  }

  private conversation(m: Conversation): void {
    const callerId = m.parent_tool_use_id ?? null;
    const content = m.message.content;
    if (typeof content === "string") return;
    for (const block of content) {
      const use = ToolUseBlock.safeParse(block);
      if (use.success && m.type === "assistant") {
        this.toolUse(use.data, callerId);
        continue;
      }
      const res = ToolResultBlock.safeParse(block);
      if (res.success && m.type === "user") {
        this.toolResult(res.data, callerId, m.tool_use_result);
        continue;
      }
      const text = TextBlock.safeParse(block);
      if (text.success && m.type === "assistant" && callerId === null) {
        this.lastText = text.data.text;
      }
    }
  }

  private toolUse(block: z.infer<typeof ToolUseBlock>, agentId: string | null): void {
    this.tools.set(block.id, { name: block.name, input: block.input, agentId });
    this.emit({
      type: "tool.invoked",
      reliability: "authoritative",
      severity: "info",
      agentId,
      summary: this.summary(block.name, block.input),
      payload: { toolUseId: block.id, toolName: block.name, input: block.input },
    });
    if (SPAWN_TOOLS.has(block.name)) {
      const subagentType = typeof block.input.subagent_type === "string" ? block.input.subagent_type : null;
      const description = typeof block.input.description === "string" ? block.input.description : null;
      this.emit({
        type: "agent.spawned",
        reliability: "authoritative",
        severity: "info",
        agentId: block.id,
        summary: `Spawned ${subagentType ?? "a"} subagent${description ? `: ${description}` : ""}`,
        payload: { parentAgentId: agentId, subagentType, description, toolUseId: block.id },
      });
    }
    this.onToolUse?.({ toolUseId: block.id, name: block.name, input: block.input, agentId });
  }

  private toolResult(
    block: z.infer<typeof ToolResultBlock>,
    agentId: string | null,
    toolUseResult: unknown,
  ): void {
    const call = this.tools.get(block.tool_use_id);
    this.tools.delete(block.tool_use_id);
    const name = call?.name ?? "tool";
    const input = call?.input ?? {};
    const isError = block.is_error === true;
    this.emit({
      type: "tool.completed",
      reliability: "authoritative",
      severity: isError ? "warn" : "info",
      agentId: call?.agentId ?? agentId,
      summary: `${this.summary(name, input)}${isError ? " failed" : ""}`,
      payload: { toolUseId: block.tool_use_id, toolName: name, isError },
    });
    if (!call || isError) return;

    const file = input.file_path ?? input.notebook_path;
    if (FILE_WRITE_TOOLS.has(name) && typeof file === "string") {
      const shown = displayPath(file, this.cwd);
      this.emit({
        type: "file.modified",
        reliability: "derived",
        severity: "info",
        agentId: call.agentId,
        summary: `Modified ${shown}`,
        payload: { path: shown, absolutePath: file, tool: name, toolUseId: block.tool_use_id },
      });
    }
    if (SPAWN_TOOLS.has(name)) {
      const report = (toolUseResult as { content?: unknown } | undefined)?.content;
      const summary = clip(textOf(report) ?? textOf(block.content));
      this.emit({
        type: "agent.completed",
        reliability: "authoritative",
        severity: "info",
        agentId: block.tool_use_id,
        summary: "Subagent completed",
        payload: { parentAgentId: call.agentId, summary, toolUseId: block.tool_use_id },
      });
    }
  }

  private result(r: z.infer<typeof ResultSchema>): MapperSignal {
    const usage = usageOf(r);
    const ok = r.subtype === "success" && r.is_error !== true;
    const outcome = ok ? "completed" : this.interruptRequested ? "interrupted" : "failed";
    this.interruptRequested = false;
    const resultText = ok ? (r.result ?? this.lastText) : this.lastText;
    this.lastText = null;
    const error =
      outcome === "failed"
        ? (r.errors?.filter((e): e is string => typeof e === "string").join("; ") || r.subtype)
        : null;
    const payload = {
      outcome,
      usage,
      numTurns: r.num_turns ?? null,
      durationMs: r.duration_ms ?? null,
      resultText: clip(resultText),
    };
    if (outcome === "failed") {
      this.emit({
        type: "error",
        reliability: "authoritative",
        severity: "error",
        agentId: null,
        summary: `Turn failed: ${error ?? r.subtype}`,
        payload: { ...payload, error },
      });
    } else {
      this.emit({
        type: "agent.waiting",
        reliability: "authoritative",
        severity: "info",
        agentId: null,
        summary:
          outcome === "completed"
            ? "Turn completed — waiting for input"
            : "Turn interrupted — waiting for input",
        payload,
      });
    }
    return {
      kind: "result",
      result: {
        outcome,
        sessionId: this.sessionId ?? r.session_id ?? null,
        resultText,
        usage,
        error,
      },
    };
  }

  private summary(toolName: string, input: Record<string, unknown>): string {
    return toolSummary({
      session_id: this.sessionId ?? "unknown",
      hook_event_name: "PreToolUse",
      ...(this.cwd === undefined ? {} : { cwd: this.cwd }),
      tool_name: toolName,
      tool_input: input,
    });
  }

  private emit(e: Omit<EventInput, "source" | "executionId" | "taskId" | "sessionId">): void {
    this.sink.emit({
      ...e,
      source: this.ctx.source,
      executionId: this.ctx.executionId,
      taskId: this.ctx.taskId,
      sessionId: this.sessionId,
    });
  }
}
