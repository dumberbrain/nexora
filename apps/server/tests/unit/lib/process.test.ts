import { describe, expect, it } from "vitest";

import {
  ALLOWED_COMMANDS,
  ProcessNotAllowedError,
  ProcessTimeoutError,
  runCommand,
} from "../../../src/lib/process";

describe("runCommand", () => {
  it("allows only claude, git and gh", () => {
    expect([...ALLOWED_COMMANDS].sort()).toEqual(["claude", "gh", "git"]);
  });

  it.each(["node", "rm", "powershell", "cmd", "bash", "git;rm", "/usr/bin/git", "C:\\git.exe"])(
    "rejects %s",
    async (cmd) => {
      await expect(runCommand(cmd as never, ["--version"])).rejects.toThrow(ProcessNotAllowedError);
    },
  );

  it("runs an allowed command with array args and captures stdout", async () => {
    const r = await runCommand("git", ["--version"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/git version/);
  });

  it("never interprets shell metacharacters in arguments", async () => {
    // With a shell this would chain a second command; with shell:false git just sees one odd arg.
    const r = await runCommand("git", ["--version", "&& echo INJECTED"], { allowNonZero: true });
    expect(r.stdout + r.stderr).not.toMatch(/^INJECTED$/m);
  });

  it("rejects non-string arguments", async () => {
    await expect(runCommand("git", [1 as unknown as string])).rejects.toThrow(TypeError);
  });

  it("returns non-zero exit codes when allowNonZero is set, otherwise throws", async () => {
    const r = await runCommand("git", ["definitely-not-a-git-command"], { allowNonZero: true });
    expect(r.exitCode).not.toBe(0);
    await expect(runCommand("git", ["definitely-not-a-git-command"])).rejects.toThrow(/exited/);
  });

  it("kills the process tree and throws on timeout", async () => {
    // `git hash-object --stdin` blocks waiting for stdin until killed.
    await expect(
      runCommand("git", ["hash-object", "--stdin"], { timeoutMs: 300, keepStdinOpen: true }),
    ).rejects.toThrow(ProcessTimeoutError);
  });
});
