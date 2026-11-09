import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";

/** The only executables Nexora may start (FR-051). Exact names — no paths, no shells. */
export const ALLOWED_COMMANDS = new Set(["claude", "git", "gh"] as const);
export type AllowedCommand = "claude" | "git" | "gh";

export class ProcessNotAllowedError extends Error {
  override readonly name = "ProcessNotAllowedError";
}
export class ProcessTimeoutError extends Error {
  override readonly name = "ProcessTimeoutError";
}
export class ProcessExitError extends Error {
  override readonly name = "ProcessExitError";
  constructor(
    message: string,
    readonly result: RunResult,
  ) {
    super(message);
  }
}

export interface RunOptions {
  cwd?: string;
  /** default 60 s */
  timeoutMs?: number;
  /** resolve with a non-zero exit code instead of throwing */
  allowNonZero?: boolean;
  /** extra env vars (merged over process.env) */
  env?: Record<string, string>;
  /** data written to stdin, then stdin is closed */
  input?: string;
  /** leave stdin open (testing hangs); default closes it immediately */
  keepStdinOpen?: boolean;
  /** cap per stream, default 10 MB */
  maxOutputBytes?: number;
}

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
}

const isWin = process.platform === "win32";

/** Known install locations used when the binary is not (yet) on PATH. */
function fallbackLocations(cmd: AllowedCommand): string[] {
  if (!isWin) return [path.join(homedir(), ".local", "bin", cmd)];
  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  switch (cmd) {
    case "gh":
      return [path.join(programFiles, "GitHub CLI", "gh.exe")];
    case "git":
      return [path.join(programFiles, "Git", "cmd", "git.exe")];
    case "claude":
      return [path.join(homedir(), ".local", "bin", "claude.exe")];
  }
}

const resolved = new Map<AllowedCommand, string>();

/** Absolute path of an allowed executable (PATH first, then known locations). */
export function resolveExecutable(cmd: AllowedCommand): string {
  const cached = resolved.get(cmd);
  if (cached) return cached;
  const file = isWin ? `${cmd}.exe` : cmd;
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const candidates = [...dirs.map((d) => path.join(d, file)), ...fallbackLocations(cmd)];
  const hit = candidates.find((c) => existsSync(c));
  if (!hit)
    throw new ProcessNotAllowedError(`"${cmd}" is allowed but was not found on this machine`);
  resolved.set(cmd, hit);
  return hit;
}

/** Kill a process and all its children. Fixed internal helper, never user-controlled. */
function killTree(pid: number): void {
  if (isWin) {
    execFile("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true }, () => {});
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    }
  }
}

/**
 * Run an allowlisted command with an argument array and `shell: false`, so shell
 * metacharacters in arguments are never interpreted.
 */
export async function runCommand(
  cmd: AllowedCommand,
  args: readonly string[],
  opts: RunOptions = {},
): Promise<RunResult> {
  if (!ALLOWED_COMMANDS.has(cmd)) {
    throw new ProcessNotAllowedError(`Command not allowed: ${String(cmd)}`);
  }
  for (const a of args) {
    if (typeof a !== "string") throw new TypeError("All process arguments must be strings");
  }
  const exe = resolveExecutable(cmd);
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const cap = opts.maxOutputBytes ?? 10 * 1024 * 1024;

  return new Promise<RunResult>((resolve, reject) => {
    const child = spawn(exe, [...args], {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      shell: false,
      windowsHide: true,
      detached: !isWin,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;
    const collect = (which: "out" | "err") => (chunk: Buffer) => {
      const cur = which === "out" ? stdout : stderr;
      if (cur.length >= cap) {
        truncated = true;
        return;
      }
      const next = cur + chunk.toString("utf8");
      if (which === "out") stdout = next.slice(0, cap);
      else stderr = next.slice(0, cap);
    };
    child.stdout.on("data", collect("out"));
    child.stderr.on("data", collect("err"));

    if (opts.input !== undefined) child.stdin.write(opts.input);
    if (!opts.keepStdinOpen) child.stdin.end();

    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) killTree(child.pid);
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new ProcessTimeoutError(`${cmd} timed out after ${timeoutMs} ms`));
        return;
      }
      const result: RunResult = { exitCode: code ?? -1, stdout, stderr, truncated };
      if (result.exitCode !== 0 && !opts.allowNonZero) {
        reject(new ProcessExitError(`${cmd} exited with code ${result.exitCode}`, result));
        return;
      }
      resolve(result);
    });
  });
}

export interface StreamingOptions {
  cwd?: string;
  env?: Record<string, string>;
  /** cap for the collected stderr, default 64 KB */
  maxStderrBytes?: number;
}

export interface StreamingExit {
  exitCode: number;
  stderr: string;
  /** spawn error (e.g. ENOENT), if any */
  error: string | null;
}

/** A long-running allowlisted process with line-oriented stdout and writable stdin. */
export interface StreamingProcess {
  readonly pid: number | undefined;
  /** stdout split into lines */
  readonly lines: AsyncIterable<string>;
  /** resolves once the process has exited (never rejects) */
  readonly exited: Promise<StreamingExit>;
  /** write one line (a trailing newline is added) */
  writeLine(line: string): void;
  endInput(): void;
  /** kill the process and its children */
  kill(): void;
}

/**
 * Spawn an allowlisted command for streaming I/O (`claude -p --input-format stream-json`): same
 * guarantees as runCommand — exact executable names, argument arrays, `shell: false`.
 */
export function spawnStreaming(
  cmd: AllowedCommand,
  args: readonly string[],
  opts: StreamingOptions = {},
): StreamingProcess {
  if (!ALLOWED_COMMANDS.has(cmd)) {
    throw new ProcessNotAllowedError(`Command not allowed: ${String(cmd)}`);
  }
  for (const a of args) {
    if (typeof a !== "string") throw new TypeError("All process arguments must be strings");
  }
  const exe = resolveExecutable(cmd);
  const cap = opts.maxStderrBytes ?? 64 * 1024;
  const child = spawn(exe, [...args], {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    shell: false,
    windowsHide: true,
    detached: !isWin,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    if (stderr.length < cap) stderr = (stderr + chunk.toString("utf8")).slice(0, cap);
  });
  child.stdin.on("error", () => {
    /* the process went away; its exit is reported through `exited` */
  });

  const exited = new Promise<StreamingExit>((resolve) => {
    let spawnError: string | null = null;
    child.on("error", (err) => {
      spawnError = err.message;
      // a failed spawn never emits "close" with a pid
      if (child.pid === undefined) resolve({ exitCode: -1, stderr, error: spawnError });
    });
    child.on("close", (code) => resolve({ exitCode: code ?? -1, stderr, error: spawnError }));
  });

  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  return {
    pid: child.pid,
    lines,
    exited,
    writeLine(line) {
      if (child.stdin.writable) child.stdin.write(`${line}\n`);
    },
    endInput() {
      if (child.stdin.writable) child.stdin.end();
    },
    kill() {
      if (child.pid && child.exitCode === null) killTree(child.pid);
    },
  };
}
