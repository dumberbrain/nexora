import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type EventInput } from "../../../src/modules/event-manager";
import {
  AgentTeamPtyAdapter,
  type AgentTeamPtyAdapterOptions,
  childEnv,
} from "../../../src/modules/runtime-manager/adapters/agent-team-pty/agent-team-pty.adapter";
import {
  CapabilityUnsupportedError,
  type RuntimeDeps,
  type StartSessionInput,
} from "../../../src/modules/runtime-manager/runtime-adapter";
import { FakePtyModule, SCREENS } from "../../fakes/fake-pty";

const SID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
let root: string;
let home: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "ubuliera-pty-"));
  home = mkdtempSync(path.join(tmpdir(), "ubuliera-home-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

function setup(opts: Partial<AgentTeamPtyAdapterOptions> = {}) {
  const pty = new FakePtyModule(777);
  const killTree = vi.fn((_pid: number) => Promise.resolve());
  const adapter = new AgentTeamPtyAdapter({
    loadPty: () => Promise.resolve(pty),
    claudePath: () => "C:\\bin\\claude.exe",
    version: () => Promise.resolve("2.1.321 (Claude Code)"),
    claudeHome: home,
    env: {
      PATH: "/usr/bin",
      CLAUDECODE: "1",
      CLAUDE_CODE_CHILD_SESSION: "1",
      CLAUDE_CODE_ENTRYPOINT: "cli",
      CLAUDECODE_SOMETHING: "x",
      ANTHROPIC_MODEL: "keep",
    },
    platform: "linux",
    pollIntervalMs: 0,
    newSessionId: () => SID,
    killTree,
    ...opts,
  });
  const events: EventInput[] = [];
  const sessionIds: string[] = [];
  const deps: RuntimeDeps = {
    sink: { emit: (e) => events.push(e) },
    guard: { check: () => ({ decision: "allow" }) },
    approvals: { request: () => Promise.resolve("deny") },
    onSessionId: (id) => sessionIds.push(id),
  };
  const input = (patch: Partial<StartSessionInput> = {}): StartSessionInput => ({
    executionId: "01JEXEC0000000000000000000",
    taskId: null,
    projectRoot: root,
    cwd: path.join(root, ".ubuliera", "worktrees", "e1"),
    prompt: "Build it\nwith a team",
    ownedPaths: [],
    permissionMode: "acceptEdits",
    model: "sonnet",
    ...patch,
  });
  return { adapter, pty, killTree, events, sessionIds, deps, input };
}

describe("childEnv", () => {
  it("strips CLAUDECODE*/CLAUDE_CODE_* markers but sets the Agent Teams flag", () => {
    const env = childEnv({
      PATH: "/bin",
      CLAUDECODE: "1",
      CLAUDE_CODE_SSE_PORT: "1",
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "0",
      HOME: "/h",
      UNDEF: undefined,
    });
    expect(env).toEqual({ PATH: "/bin", HOME: "/h", CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" });
  });
});

describe("AgentTeamPtyAdapter", () => {
  it("detect: unavailable with a reason (observe-only fallback) when node-pty cannot load", async () => {
    const { adapter, deps, input } = setup({
      loadPty: () => Promise.reject(new Error("no prebuilt binary")),
    });
    const d = await adapter.detect();
    expect(d.available).toBe(false);
    expect(d.reason).toMatch(/node-pty/);
    expect(d.reason).toMatch(/no prebuilt binary/);
    expect(d.reason).toMatch(/own terminal/);
    await expect(adapter.start(input(), deps)).rejects.toThrow(/node-pty/);
  });

  it("detect: available with the claude version when node-pty loads", async () => {
    const { adapter } = setup();
    expect(await adapter.detect()).toEqual({
      available: true,
      version: "2.1.321 (Claude Code)",
      reason: null,
    });
  });

  it("spawns interactive claude in the worktree with a fixed session id and a clean env", async () => {
    const { adapter, pty, deps, input, sessionIds, events } = setup();
    const handle = await adapter.start(input(), deps);
    const p = pty.last;
    expect(p.file).toBe("C:\\bin\\claude.exe");
    expect(p.args).toEqual([
      "--session-id",
      SID,
      "--permission-mode",
      "acceptEdits",
      "--model",
      "sonnet",
    ]);
    expect(p.args).not.toContain("-p");
    expect(p.opts.cwd).toBe(path.join(root, ".ubuliera", "worktrees", "e1"));
    expect(p.opts.env).toEqual({
      PATH: "/usr/bin",
      ANTHROPIC_MODEL: "keep",
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1",
    });
    expect(await handle.sessionId).toBe(SID);
    expect(sessionIds).toEqual([SID]);
    expect(events[0]).toMatchObject({ type: "session.started", sessionId: SID });
    expect(adapter.isLeadSession(SID)).toBe(true);
    await handle.stop();
  });

  it("rejects a cwd outside the project and resume (unsupported)", async () => {
    const { adapter, deps, input } = setup();
    await expect(adapter.start(input({ cwd: tmpdir() }), deps)).rejects.toThrow(/outside/);
    await expect(adapter.start(input({ resumeSessionId: SID }), deps)).rejects.toBeInstanceOf(
      CapabilityUnsupportedError,
    );
  });

  it("never answers the workspace-trust dialog; waits for the user, then types the prompt", async () => {
    const { adapter, pty, deps, input, events } = setup();
    const handle = await adapter.start(input(), deps);
    const p = pty.last;
    const changes: boolean[] = [];
    adapter.onWaitingChange(SID, (w) => changes.push(w));

    p.emit(SCREENS.trust);
    expect(p.writes).toEqual([]); // no Enter: the default option is "No, exit"
    expect(adapter.isWaitingForInput(SID)).toBe(true);
    expect(changes).toEqual([true]);
    const waiting = events.find((e) => e.type === "agent.waiting");
    expect(waiting?.payload).toMatchObject({ reason: "startup_dialog", dialog: "workspace_trust" });
    expect((waiting?.payload as { outcome?: unknown }).outcome).toBeUndefined();

    // the user answers in the terminal; the TUI then shows the input box
    adapter.terminal(SID)?.write("1");
    p.emit(SCREENS.ready);
    expect(adapter.isWaitingForInput(SID)).toBe(false);
    expect(changes).toEqual([true, false]);
    expect(p.writes).toEqual(["1", "\x1b[200~Build it\nwith a team\x1b[201~", "\r"]);

    // the prompt is typed only once
    p.emit(SCREENS.ready);
    expect(p.writes).toHaveLength(3);
    await handle.stop();
  });

  it("accepts the accept-edits footer as a ready input box", async () => {
    const { adapter, pty, deps, input } = setup();
    const handle = await adapter.start(input(), deps);
    pty.last.emit(SCREENS.acceptEditsFooter);
    expect(pty.last.typed).toContain("Build it");
    await handle.stop();
  });

  it("queues messages until the input box is ready; interrupt sends Ctrl-C", async () => {
    const { adapter, pty, deps, input } = setup();
    const handle = await adapter.start(input(), deps);
    await handle.sendMessage("follow up");
    expect(pty.last.writes).toEqual([]);
    pty.last.emit(SCREENS.ready);
    expect(pty.last.typed).toBe(
      "\x1b[200~Build it\nwith a team\x1b[201~\r\x1b[200~follow up\x1b[201~\r",
    );
    await handle.interrupt();
    expect(pty.last.writes.at(-1)).toBe("\x03");
    await expect(handle.setPermissionMode("plan")).rejects.toBeInstanceOf(
      CapabilityUnsupportedError,
    );
    await handle.stop();
  });

  it("stop uses the process-tree kill on Windows (pty.kill throws there) and kill elsewhere", async () => {
    const win = setup({ platform: "win32" });
    const h1 = await win.adapter.start(win.input(), win.deps);
    await h1.stop();
    expect(win.killTree).toHaveBeenCalledWith(777);
    expect(win.pty.last.killed).toBe(false);
    expect((await h1.done).outcome).toBe("stopped");
    expect(win.events.at(-1)).toMatchObject({ type: "session.stopped" });

    const nix = setup({ platform: "linux" });
    const h2 = await nix.adapter.start(nix.input(), nix.deps);
    await h2.stop();
    expect(nix.killTree).not.toHaveBeenCalled();
    expect(nix.pty.last.killed).toBe(true);
    expect(nix.adapter.isLeadSession(SID)).toBe(false);
  });

  it("process exit settles done (0 = completed, else failed) and notifies terminal viewers", async () => {
    const { adapter, pty, deps, input } = setup();
    const handle = await adapter.start(input(), deps);
    const term = adapter.terminal(SID);
    const exits: (number | null)[] = [];
    term?.onExit((code) => exits.push(code));
    pty.last.exit(3);
    const r = await handle.done;
    expect(r.outcome).toBe("failed");
    expect(r.error).toMatch(/3/);
    expect(exits).toEqual([3]);
  });

  it("keeps a bounded output backlog and streams output to terminal viewers", async () => {
    const { adapter, pty, deps, input } = setup({ backlogChars: 10 });
    const handle = await adapter.start(input(), deps);
    const term = adapter.terminal(SID);
    const seen: string[] = [];
    const off = term?.onOutput((d) => seen.push(d));
    pty.last.emit("0123456789");
    pty.last.emit("abcdef");
    expect(term?.backlog()).toBe("6789abcdef");
    expect(seen).toEqual(["0123456789", "abcdef"]);
    off?.();
    pty.last.emit("zz");
    expect(seen).toHaveLength(2);
    term?.resize(100, 30);
    expect(pty.last.resizes).toEqual([[100, 30]]);
    expect(adapter.terminal("unknown")).toBeUndefined();
    await handle.stop();
  });
});
