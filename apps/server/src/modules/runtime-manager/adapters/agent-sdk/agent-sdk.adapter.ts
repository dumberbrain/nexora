import {
  type CanUseTool,
  type HookCallback,
  type HookJSONOutput,
  type Options,
  type PermissionMode,
  query,
  type SDKUserMessage,
  type SettingSource,
} from "@anthropic-ai/claude-agent-sdk";
import { type RuntimeCapabilityProfile } from "@ubuliera/contracts";

import { InputQueue } from "./input-queue";
import { MessageMapper } from "./message-mapper";
import { AGENT_SDK_CAPABILITIES } from "../../capabilities";
import {
  type RuntimeAdapter,
  type RuntimeDeps,
  type RuntimeDetection,
  type SessionHandle,
  type StartSessionInput,
} from "../../runtime-adapter";
import { assertSessionCwd } from "../session-cwd";
import { deferred, TurnTracker } from "../turn-tracker";

/** The part of the SDK's Query object the adapter uses (lets tests inject a fake). */
export interface SdkQuery extends AsyncIterable<unknown> {
  interrupt(): Promise<unknown>;
  close(): void;
  setPermissionMode(mode: PermissionMode): Promise<void>;
}

export type QueryFn = (params: {
  prompt: AsyncIterable<SDKUserMessage>;
  options: Options;
}) => SdkQuery;

export interface AgentSdkAdapterOptions {
  /** default: the SDK's query() */
  queryFn?: QueryFn;
}

/** The user's own settings and CLAUDE.md apply to managed sessions. */
const SETTING_SOURCES: SettingSource[] = ["user", "project", "local"];

/** Options shared by managed sessions; exported for the runtime manager's read-only query. */
export function sessionOptions(input: StartSessionInput): Options {
  return {
    cwd: input.cwd,
    permissionMode: input.permissionMode,
    ...(input.permissionMode === "bypassPermissions"
      ? { allowDangerouslySkipPermissions: true }
      : {}),
    settingSources: SETTING_SOURCES,
    ...(input.model === undefined ? {} : { model: input.model }),
    ...(input.agents === undefined ? {} : { agents: input.agents }),
    ...(input.allowedTools === undefined ? {} : { allowedTools: input.allowedTools }),
    ...(input.disallowedTools === undefined ? {} : { disallowedTools: input.disallowedTools }),
    ...(input.maxTurns === undefined ? {} : { maxTurns: input.maxTurns }),
    ...(input.maxBudgetUsd === undefined ? {} : { maxBudgetUsd: input.maxBudgetUsd }),
    ...(input.resumeSessionId === undefined ? {} : { resume: input.resumeSessionId }),
  };
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Agent SDK runtime (T085, research R1/S3): `query()` in streaming-input mode. Tool calls pass the
 * scope guard twice — in a PreToolUse hook (covers tools the user's settings auto-allow) and in
 * canUseTool — and anything that needs a human goes to the ApprovalGate.
 */
export class AgentSdkAdapter implements RuntimeAdapter {
  readonly kind = "agent_sdk" as const;
  private readonly queryFn: QueryFn;

  constructor(opts: AgentSdkAdapterOptions = {}) {
    this.queryFn = opts.queryFn ?? ((params) => query(params));
  }

  /** The SDK ships its own Claude Code binary; authentication is not probed (no model calls). */
  detect(): Promise<RuntimeDetection> {
    return Promise.resolve({ available: true, version: null, reason: null });
  }

  capabilities(): RuntimeCapabilityProfile {
    return AGENT_SDK_CAPABILITIES;
  }

  start(input: StartSessionInput, deps: RuntimeDeps): Promise<SessionHandle> {
    try {
      assertSessionCwd(input);
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
    const mapper = new MessageMapper(
      { executionId: input.executionId, taskId: input.taskId, source: "agent_sdk" },
      deps.sink,
    );
    const turns = new TurnTracker();
    const queue = new InputQueue();
    queue.push(input.prompt);

    const sessionKnown = deferred<string>();
    sessionKnown.promise.catch(() => undefined);
    let sessionId: string | null = input.resumeSessionId ?? null;
    let stopped = false;

    const canUseTool: CanUseTool = async (toolName, toolInput, opts) => {
      const sid = sessionId ?? "unknown";
      const agentId = opts.agentID ?? null;
      const d = deps.guard.check({ sessionId: sid, agentId, toolName, input: toolInput });
      if (d.decision === "allow") return { behavior: "allow", updatedInput: toolInput };
      if (d.decision === "deny") return { behavior: "deny", message: d.reason };
      const answer = await deps.approvals.request({
        executionId: input.executionId,
        taskId: input.taskId,
        sessionId: sid,
        agentId,
        toolName,
        input: toolInput,
        riskClass: d.riskClass,
        reason: d.reason,
      });
      return answer === "allow"
        ? { behavior: "allow", updatedInput: toolInput }
        : { behavior: "deny", message: "Denied by the user in Ubuliera" };
    };

    const preToolUse: HookCallback = (hookInput) => {
      if (hookInput.hook_event_name !== "PreToolUse") return Promise.resolve({});
      const toolInput =
        typeof hookInput.tool_input === "object" && hookInput.tool_input !== null
          ? (hookInput.tool_input as Record<string, unknown>)
          : {};
      const d = deps.guard.check({
        sessionId: hookInput.session_id,
        agentId: hookInput.agent_id ?? null,
        toolName: hookInput.tool_name,
        input: toolInput,
      });
      const out: HookJSONOutput =
        d.decision === "allow"
          ? {}
          : {
              hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: d.decision,
                permissionDecisionReason: d.reason,
              },
            };
      return Promise.resolve(out);
    };

    const q = this.queryFn({
      prompt: queue,
      options: {
        ...sessionOptions(input),
        canUseTool,
        hooks: { PreToolUse: [{ matcher: "*", hooks: [preToolUse] }] },
      },
    });

    const pump = async () => {
      try {
        for await (const raw of q) {
          const signal = mapper.map(raw);
          if (signal?.kind === "init") {
            sessionId = signal.sessionId;
            if (signal.first) {
              deps.onSessionId?.(signal.sessionId, { model: signal.model, cwd: signal.cwd });
              sessionKnown.resolve(signal.sessionId);
            }
          } else if (signal?.kind === "result") {
            turns.settle(signal.result);
          }
        }
        turns.settle(endResult(sessionId, stopped ? "stopped" : "failed", "session ended"));
      } catch (err) {
        turns.settle(endResult(sessionId, stopped ? "stopped" : "failed", errorText(err)));
      } finally {
        sessionKnown.reject(new Error("session ended before Claude reported a session id"));
      }
    };
    void pump();

    const handle: SessionHandle = {
      kind: "agent_sdk",
      sessionId: sessionKnown.promise,
      get done() {
        return turns.current;
      },
      stop: () => {
        if (stopped) return Promise.resolve();
        stopped = true;
        queue.end();
        q.close();
        turns.settle(endResult(sessionId, "stopped", null));
        deps.sink.emit({
          type: "session.stopped",
          source: "agent_sdk",
          reliability: "authoritative",
          severity: "info",
          executionId: input.executionId,
          taskId: input.taskId,
          sessionId,
          agentId: null,
          summary: "Session stopped by Ubuliera",
          payload: { reason: "stopped" },
        });
        return Promise.resolve();
      },
      interrupt: async () => {
        mapper.markInterrupted();
        await q.interrupt();
      },
      sendMessage: (text) => {
        if (stopped || queue.closed) return Promise.reject(new Error("session is stopped"));
        turns.next();
        queue.push(text);
        return Promise.resolve();
      },
      setPermissionMode: (mode) => q.setPermissionMode(mode),
    };
    return Promise.resolve(handle);
  }
}

export function endResult(
  sessionId: string | null,
  outcome: "stopped" | "failed",
  error: string | null,
) {
  return {
    outcome,
    sessionId,
    resultText: null,
    usage: null,
    error: outcome === "failed" ? error : null,
  } as const;
}
