import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { type RuntimeCapabilityProfile, type RuntimeKind } from "@nexora/contracts";

import { FAKE_RUNTIME_CAPABILITIES } from "../../capabilities";
import {
  type RuntimeAdapter,
  type RuntimeDeps,
  type RuntimeDetection,
  type SessionHandle,
  type SessionResult,
  type StartSessionInput,
} from "../../runtime-adapter";

/**
 * Deterministic runtime for E2E (T083). Registered only when `NEXORA_TEST_FAKE_RUNTIME=1` and
 * `NODE_ENV=test` (loadEnv refuses the flag elsewhere). No model, no network, no child process:
 * each session writes one marker file inside its own worktree `cwd`, emits the matching events
 * and completes its turn after `stepMs`.
 */
export class ScriptedFakeAdapter implements RuntimeAdapter {
  readonly kind: RuntimeKind = "agent_sdk";

  constructor(private readonly opts: { stepMs?: number } = {}) {}

  detect(): Promise<RuntimeDetection> {
    return Promise.resolve({ available: true, version: "fake", reason: null });
  }

  capabilities(): RuntimeCapabilityProfile {
    return FAKE_RUNTIME_CAPABILITIES;
  }

  start(input: StartSessionInput, deps: RuntimeDeps): Promise<SessionHandle> {
    const stepMs = this.opts.stepMs ?? 300;
    const sessionId = randomUUID();
    const base = {
      source: "agent_sdk" as const,
      executionId: input.executionId || null,
      taskId: input.taskId,
      sessionId,
      agentId: null,
    };
    let settle!: (r: SessionResult) => void;
    let finished = false;
    const done = new Promise<SessionResult>((r) => (settle = r));
    const finish = (outcome: SessionResult["outcome"], text: string | null) => {
      if (finished) return;
      finished = true;
      settle({ outcome, sessionId, resultText: text, usage: null, error: null });
    };

    deps.onSessionId?.(sessionId, { model: "fake", cwd: input.cwd });
    deps.sink.emit({
      ...base,
      type: "session.started",
      reliability: "authoritative",
      severity: "info",
      summary: "Session started (fake)",
      payload: { model: "fake", cwd: input.cwd, permissionMode: input.permissionMode },
    });

    const timer = setTimeout(() => {
      if (finished) return;
      // read-only queries (plan mode) only answer; task sessions write one marker file
      if (input.permissionMode !== "plan" && input.taskId) {
        // write the first concrete owned path (the scope guard denies anything else)
        const owned = input.ownedPaths.find((p) => !/[*?[\]{}]/.test(p));
        const file = path.join(input.cwd, owned ?? `nexora-e2e-${input.taskId}.md`);
        mkdirSync(path.dirname(file), { recursive: true });
        const call = { file_path: file, content: `# ${input.taskId}\n` };
        const decision = deps.guard.check({
          sessionId,
          agentId: null,
          toolName: "Write",
          input: call,
        });
        deps.sink.emit({
          ...base,
          type: "tool.invoked",
          reliability: "authoritative",
          severity: "info",
          summary: `Write ${path.basename(file)}`,
          payload: { toolUseId: `fake-${sessionId}`, toolName: "Write", input: call },
        });
        if (decision.decision === "allow") {
          writeFileSync(file, call.content);
          deps.sink.emit({
            ...base,
            type: "file.modified",
            reliability: "derived",
            severity: "info",
            summary: `Modified ${path.basename(file)}`,
            payload: { path: path.basename(file), absolutePath: file, tool: "Write" },
          });
        }
      }
      const resultText = input.permissionMode === "plan" ? "{}" : "Task done (fake)";
      deps.sink.emit({
        ...base,
        type: "agent.waiting",
        reliability: "authoritative",
        severity: "info",
        summary: "Turn completed — waiting for input",
        payload: { outcome: "completed", usage: null, resultText },
      });
      finish("completed", resultText);
    }, stepMs);

    const stopNow = (outcome: "stopped" | "interrupted") => {
      clearTimeout(timer);
      if (outcome === "stopped") {
        deps.sink.emit({
          ...base,
          type: "session.stopped",
          reliability: "authoritative",
          severity: "info",
          summary: "Session stopped by Nexora",
          payload: { reason: "stopped" },
        });
      }
      finish(outcome, null);
      return Promise.resolve();
    };

    return Promise.resolve({
      kind: this.kind,
      sessionId: Promise.resolve(sessionId),
      done,
      stop: () => stopNow("stopped"),
      interrupt: () => stopNow("interrupted"),
      sendMessage: () => Promise.resolve(),
      setPermissionMode: () => Promise.resolve(),
    });
  }
}
