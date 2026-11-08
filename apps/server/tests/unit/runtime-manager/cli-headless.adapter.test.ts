import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { type StreamingExit, type StreamingProcess } from "../../../src/lib/process";
import { type EventInput } from "../../../src/modules/event-manager";
import {
  CliHeadlessAdapter,
  cliArgs,
} from "../../../src/modules/runtime-manager/adapters/cli-headless/cli-headless.adapter";
import { CLI_HEADLESS_CAPABILITIES } from "../../../src/modules/runtime-manager/capabilities";
import {
  CapabilityUnsupportedError,
  type StartSessionInput,
  type ToolDecision,
} from "../../../src/modules/runtime-manager/runtime-adapter";

const fixture = readFileSync(
  join(import.meta.dirname, "..", "..", "fixtures", "stream-json", "s1-subagent-write.jsonl"),
  "utf8",
)
  .split("\n")
  .filter((l) => l.trim());

interface StubProcess extends StreamingProcess {
  emitLine(line: string): void;
  exit(code: number): void;
  written: string[];
  killed: boolean;
}

function stubProcess(): StubProcess {
  const queue: string[] = [];
  let wake: (() => void) | undefined;
  let closed = false;
  let resolveExit!: (e: StreamingExit) => void;
  const exited = new Promise<StreamingExit>((r) => (resolveExit = r));
  const p: StubProcess = {
    pid: 4242,
    written: [],
    killed: false,
    exited,
    lines: {
      async *[Symbol.asyncIterator]() {
        for (;;) {
          const next = queue.shift();
          if (next !== undefined) {
            yield next;
            continue;
          }
          if (closed) return;
          await new Promise<void>((r) => (wake = r));
          wake = undefined;
        }
      },
    },
    emitLine(line) {
      queue.push(line);
      wake?.();
    },
    exit(code) {
      closed = true;
      wake?.();
      resolveExit({ exitCode: code, stderr: "", error: null });
    },
    writeLine(line) {
      p.written.push(line);
    },
    endInput() {},
    kill() {
      p.killed = true;
      p.exit(1);
    },
  };
  return p;
}

const input: StartSessionInput = {
  executionId: "01EXEC",
  taskId: "T-1",
  projectRoot: "C:\\work\\demo-repo",
  cwd: "C:\\work\\demo-repo",
  prompt: "delegate",
  ownedPaths: [],
  permissionMode: "default",
  model: "haiku",
  maxTurns: 4,
  resumeSessionId: "abc",
};

function setup(decision: ToolDecision = { decision: "allow" }) {
  const proc = stubProcess();
  const spawn = vi.fn(() => proc);
  const events: EventInput[] = [];
  const adapter = new CliHeadlessAdapter({ spawn });
  const deps = {
    sink: { emit: (e: EventInput) => events.push(e) },
    guard: { check: vi.fn(() => decision) },
    approvals: { request: vi.fn(() => Promise.resolve<"allow" | "deny">("deny")) },
    onSessionId: vi.fn(),
  };
  return { proc, spawn, events, adapter, deps };
}

describe("CliHeadlessAdapter", () => {
  it("builds stream-json CLI arguments (no shell, shell tools disallowed)", () => {
    const args = cliArgs(input);
    expect(args.slice(0, 6)).toEqual([
      "-p",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--verbose",
    ]);
    expect(args).toEqual(
      expect.arrayContaining(["--permission-mode", "default", "--model", "haiku", "--max-turns", "4"]),
    );
    expect(args[args.indexOf("--resume") + 1]).toBe("abc");
    expect(args[args.indexOf("--disallowedTools") + 1]).toContain("Bash");
    expect(args[args.indexOf("--disallowedTools") + 1]).toContain("PowerShell");
  });

  it("spawns claude in the worktree, sends the prompt as a stream-json user message", async () => {
    const t = setup();
    await t.adapter.start(input, t.deps);
    expect(t.spawn).toHaveBeenCalledWith("claude", expect.any(Array), { cwd: input.cwd });
    expect(JSON.parse(t.proc.written[0] ?? "{}")).toEqual({
      type: "user",
      message: { role: "user", content: "delegate" },
      parent_tool_use_id: null,
    });
  });

  it("maps the recorded stream with source stream_json and settles the turn", async () => {
    const t = setup();
    const handle = await t.adapter.start(input, t.deps);
    for (const line of fixture) t.proc.emitLine(line);
    t.proc.emitLine("not json at all");
    await expect(handle.sessionId).resolves.toBe("7448f0f2-4201-4d73-a3bc-92657df6269f");
    await expect(handle.done).resolves.toMatchObject({ outcome: "completed", resultText: "DONE" });
    expect(t.events.every((e) => e.source === "stream_json")).toBe(true);
    expect(t.events.map((e) => e.type)).toEqual(
      expect.arrayContaining(["session.started", "agent.spawned", "file.modified", "agent.completed"]),
    );
    expect(t.adapter.capabilities()).toEqual(CLI_HEADLESS_CAPABILITIES);

    await handle.sendMessage("again");
    expect(JSON.parse(t.proc.written[1] ?? "{}")).toMatchObject({
      message: { content: "again" },
    });
  });

  it("interrupt and setPermissionMode are unsupported; stop kills the process tree", async () => {
    const t = setup();
    const handle = await t.adapter.start(input, t.deps);
    await expect(handle.interrupt()).rejects.toBeInstanceOf(CapabilityUnsupportedError);
    await expect(handle.setPermissionMode("plan")).rejects.toBeInstanceOf(
      CapabilityUnsupportedError,
    );
    await handle.stop();
    expect(t.proc.killed).toBe(true);
    await expect(handle.done).resolves.toMatchObject({ outcome: "stopped" });
    expect(t.events.at(-1)?.type).toBe("session.stopped");
  });

  it("stops the session when a streamed tool call violates the scope guard", async () => {
    const t = setup({ decision: "deny", reason: "outside scope" });
    const handle = await t.adapter.start(input, t.deps);
    for (const line of fixture) t.proc.emitLine(line);
    await expect(handle.done).resolves.toMatchObject({ outcome: "failed" });
    expect(t.proc.killed).toBe(true);
    expect(t.events.some((e) => e.type === "error" && e.summary.includes("outside scope"))).toBe(
      true,
    );
  });

  it("a process that exits without a result fails the turn", async () => {
    const t = setup();
    const handle = await t.adapter.start(input, t.deps);
    t.proc.exit(2);
    await expect(handle.done).resolves.toMatchObject({ outcome: "failed" });
  });
});
