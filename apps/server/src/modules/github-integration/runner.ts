import {
  type AllowedCommand,
  runCommand,
  type RunOptions,
  type RunResult,
} from "../../lib/process";

/**
 * The allowlisted process runner (lib/process.ts) as an injectable function, so tests never
 * spawn real `gh` / `git`. This module only uses `gh` and `git`, always with argument arrays and
 * `shell: false`.
 */
export type ProcessRunner = (
  cmd: AllowedCommand,
  args: readonly string[],
  opts?: RunOptions,
) => Promise<RunResult>;

export const defaultRunner: ProcessRunner = (cmd, args, opts) => runCommand(cmd, args, opts);
