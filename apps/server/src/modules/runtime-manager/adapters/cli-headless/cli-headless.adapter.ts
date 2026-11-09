import { type RuntimeCapabilityProfile } from "@nexora/contracts";

import {
  runCommand,
  spawnStreaming,
  type StreamingOptions,
  type StreamingProcess,
} from "../../../../lib/process";
import { CLI_HEADLESS_CAPABILITIES } from "../../capabilities";
import {
  CapabilityUnsupportedError,
  type RuntimeAdapter,
  type RuntimeDeps,
  type RuntimeDetection,
  type SessionHandle,
  SHELL_TOOLS,
  type StartSessionInput,
} from "../../runtime-adapter";
import { userMessage } from "../agent-sdk/input-queue";
import { MessageMapper } from "../agent-sdk/message-mapper";
import { assertSessionCwd } from "../session-cwd";
import { deferred, TurnTracker } from "../turn-tracker";

export type SpawnFn = (
  cmd: "claude",
  args: readonly string[],
  opts: StreamingOptions & { cwd: string },
) => StreamingProcess;

export interface CliHeadlessAdapterOptions {
  /** default: spawnStreaming (allowlisted executable, argument array, no shell) */
  spawn?: SpawnFn;
  /** default: `claude --version` through runCommand */
  version?: () => Promise<string>;
}

/**
 * `claude -p` stream-json arguments (research R1). Without a permission prompt tool, anything that
 * needs a permission is refused by the CLI itself; shell tools are always disallowed because the
 * headless runtime cannot route them to the ApprovalGate.
 */
export function cliArgs(input: StartSessionInput): string[] {
  const args = [
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    input.permissionMode,
  ];
  if (input.model !== undefined) args.push("--model", input.model);
  if (input.maxTurns !== undefined) args.push("--max-turns", String(input.maxTurns));
  if (input.maxBudgetUsd !== undefined) args.push("--max-budget-usd", String(input.maxBudgetUsd));
  if (input.resumeSessionId !== undefined) args.push("--resume", input.resumeSessionId);
  if (input.agents !== undefined) args.push("--agents", JSON.stringify(input.agents));
  if (input.allowedTools?.length) {
    const allowed = input.allowedTools.filter((t) => !SHELL_TOOLS.has(t.split("(")[0] ?? t));
    if (allowed.length) args.push("--allowedTools", allowed.join(","));
  }
  const disallowed = new Set([...SHELL_TOOLS, ...(input.disallowedTools ?? [])]);
  args.push("--disallowedTools", [...disallowed].join(","));
  return args;
}

const defaultSpawn: SpawnFn = (cmd, args, opts) => spawnStreaming(cmd, args, opts);

async function defaultVersion(): Promise<string> {
  const r = await runCommand("claude", ["--version"], { timeoutMs: 15_000 });
  return r.stdout.trim();
}

/**
 * CLI headless runtime (T086): one `claude -p` process per session in stream-json mode; messages
 * are written to stdin, output is mapped by the shared MessageMapper (source `stream_json`).
 * Scope (T094): the CLI cannot ask Nexora before a tool runs, so shell tools are disallowed and
 * every streamed tool call is checked by the guard after the fact — a violation stops the session.
 */
export class CliHeadlessAdapter implements RuntimeAdapter {
  readonly kind = "cli_headless" as const;
  private readonly spawn: SpawnFn;
  private readonly version: () => Promise<string>;

  constructor(opts: CliHeadlessAdapterOptions = {}) {
    this.spawn = opts.spawn ?? defaultSpawn;
    this.version = opts.version ?? defaultVersion;
  }

  async detect(): Promise<RuntimeDetection> {
    try {
      const version = (await this.version()).trim();
      return { available: true, version: version || null, reason: null };
    } catch (err) {
      return {
        available: false,
        version: null,
        reason: `claude CLI not available: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  capabilities(): RuntimeCapabilityProfile {
    return CLI_HEADLESS_CAPABILITIES;
  }

  start(input: StartSessionInput, deps: RuntimeDeps): Promise<SessionHandle> {
    try {
      assertSessionCwd(input);
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }

    const turns = new TurnTracker();
    const sessionKnown = deferred<string>();
    sessionKnown.promise.catch(() => undefined);
    let sessionId: string | null = input.resumeSessionId ?? null;
    /** why Nexora ended the process: user stop, or a scope violation */
    let ending: { outcome: "stopped" | "failed"; error: string | null } | null = null;

    const proc = this.spawn("claude", cliArgs(input), { cwd: input.cwd });

    const emitEnd = (type: "session.stopped" | "error", summary: string, reason: string) =>
      deps.sink.emit({
        type,
        source: "stream_json",
        reliability: "authoritative",
        severity: type === "error" ? "error" : "info",
        executionId: input.executionId,
        taskId: input.taskId,
        sessionId,
        agentId: null,
        summary,
        payload: { reason },
      });

    const mapper = new MessageMapper(
      { executionId: input.executionId, taskId: input.taskId, source: "stream_json" },
      deps.sink,
      (call) => {
        if (ending) return;
        const d = deps.guard.check({
          sessionId: sessionId ?? "unknown",
          agentId: call.agentId,
          toolName: call.name,
          input: call.input,
        });
        if (d.decision !== "deny") return;
        ending = { outcome: "failed", error: d.reason };
        emitEnd("error", `Session stopped: ${d.reason}`, "scope_violation");
        proc.endInput();
        proc.kill();
      },
    );

    const pump = async () => {
      try {
        for await (const line of proc.lines) {
          let raw: unknown;
          try {
            raw = JSON.parse(line);
          } catch {
            continue; // non-JSON noise on stdout
          }
          const signal = mapper.map(raw);
          if (signal?.kind === "init") {
            sessionId = signal.sessionId;
            if (signal.first) {
              deps.onSessionId?.(signal.sessionId, { model: signal.model, cwd: signal.cwd });
              sessionKnown.resolve(signal.sessionId);
            }
          } else if (signal?.kind === "result" && !ending) {
            turns.settle(signal.result);
          }
        }
      } catch {
        /* stdout closed abruptly — the exit status decides */
      }
      const exit = await proc.exited;
      const outcome = ending?.outcome ?? "failed";
      const error =
        ending?.error ??
        exit.error ??
        `claude exited with code ${exit.exitCode}${exit.stderr ? `: ${exit.stderr.trim().slice(0, 500)}` : ""}`;
      turns.settle({
        outcome,
        sessionId,
        resultText: null,
        usage: null,
        error: outcome === "failed" ? error : null,
      });
      sessionKnown.reject(new Error("session ended before Claude reported a session id"));
    };
    void pump();

    proc.writeLine(JSON.stringify(userMessage(input.prompt)));

    const unsupported = (capability: string) =>
      Promise.reject(new CapabilityUnsupportedError("cli_headless", capability));

    const handle: SessionHandle = {
      kind: "cli_headless",
      sessionId: sessionKnown.promise,
      get done() {
        return turns.current;
      },
      stop: () => {
        if (ending) return Promise.resolve();
        ending = { outcome: "stopped", error: null };
        turns.settle({ outcome: "stopped", sessionId, resultText: null, usage: null, error: null });
        proc.endInput();
        proc.kill();
        emitEnd("session.stopped", "Session stopped by Nexora", "stopped");
        return Promise.resolve();
      },
      interrupt: () => unsupported("interrupt"),
      sendMessage: (text) => {
        if (ending) return Promise.reject(new Error("session is stopped"));
        turns.next();
        proc.writeLine(JSON.stringify(userMessage(text)));
        return Promise.resolve();
      },
      setPermissionMode: () => unsupported("setPermissionMode"),
    };
    return Promise.resolve(handle);
  }
}
