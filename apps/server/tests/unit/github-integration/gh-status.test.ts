import { GITHUB_AUTH_HINT, GITHUB_INSTALL_HINT, GithubStatusSchema } from "@nexora/contracts";
import { describe, expect, it } from "vitest";

import { ProcessNotAllowedError, type RunResult } from "../../../src/lib/process";
import { detectGithubStatus } from "../../../src/modules/github-integration/gh-status";
import { type ProcessRunner } from "../../../src/modules/github-integration/runner";

const ok = (stdout: string, stderr = ""): RunResult => ({
  exitCode: 0,
  stdout,
  stderr,
  truncated: false,
});

interface Call {
  cmd: string;
  args: readonly string[];
}

function fakeRunner(handler: (args: readonly string[]) => Promise<RunResult>) {
  const calls: Call[] = [];
  const run: ProcessRunner = (cmd, args) => {
    calls.push({ cmd, args });
    return handler(args);
  };
  return { run, calls };
}

const VERSION_OUT =
  "gh version 2.63.0 (2024-11-27)\nhttps://github.com/cli/cli/releases/tag/v2.63.0\n";
const AUTH_OUT = [
  "github.com",
  "  ✓ Logged in to github.com account octocat (keyring)",
  "  - Active account: true",
  "  - Git operations protocol: https",
  "  - Token: gho_************************************",
].join("\n");

describe("detectGithubStatus (T144)", () => {
  it("gh missing → not_installed with the winget install hint", async () => {
    const { run, calls } = fakeRunner(() =>
      Promise.reject(new ProcessNotAllowedError('"gh" is allowed but was not found')),
    );
    const status = await detectGithubStatus(run);
    expect(GithubStatusSchema.parse(status)).toEqual({
      status: "not_installed",
      version: null,
      account: null,
      hint: GITHUB_INSTALL_HINT,
    });
    expect(GITHUB_INSTALL_HINT).toBe("winget install --id GitHub.cli -e");
    expect(calls).toEqual([{ cmd: "gh", args: ["--version"] }]);
  });

  it("gh --version exiting non-zero also counts as not installed", async () => {
    const { run } = fakeRunner(() =>
      Promise.resolve({ exitCode: 1, stdout: "", stderr: "boom", truncated: false }),
    );
    expect((await detectGithubStatus(run)).status).toBe("not_installed");
  });

  it("`gh auth status` failing → not_authenticated with the gh auth login hint", async () => {
    const { run, calls } = fakeRunner((args) =>
      args[0] === "--version"
        ? Promise.resolve(ok(VERSION_OUT))
        : Promise.resolve({
            exitCode: 1,
            stdout: "",
            stderr: "You are not logged into any GitHub hosts. To log in, run: gh auth login",
            truncated: false,
          }),
    );
    const status = await detectGithubStatus(run);
    expect(GithubStatusSchema.parse(status)).toEqual({
      status: "not_authenticated",
      version: "2.63.0",
      account: null,
      hint: GITHUB_AUTH_HINT,
    });
    expect(GITHUB_AUTH_HINT).toBe("gh auth login");
    expect(calls.map((c) => c.args)).toEqual([
      ["--version"],
      ["auth", "status", "--hostname", "github.com"],
    ]);
  });

  it("`gh auth status` throwing (e.g. timeout) → not_authenticated", async () => {
    const { run } = fakeRunner((args) =>
      args[0] === "--version" ? Promise.resolve(ok(VERSION_OUT)) : Promise.reject(new Error("t/o")),
    );
    expect(await detectGithubStatus(run)).toMatchObject({
      status: "not_authenticated",
      hint: GITHUB_AUTH_HINT,
    });
  });

  it("ok → connected with version and account, no hint and no token echoed", async () => {
    const { run } = fakeRunner((args) =>
      Promise.resolve(args[0] === "--version" ? ok(VERSION_OUT) : ok(AUTH_OUT)),
    );
    const status = await detectGithubStatus(run);
    expect(GithubStatusSchema.parse(status)).toEqual({
      status: "connected",
      version: "2.63.0",
      account: "octocat",
      hint: null,
    });
    expect(JSON.stringify(status)).not.toContain("gho_");
  });

  it("parses the older `Logged in to github.com as <login>` form (stderr)", async () => {
    const { run } = fakeRunner((args) =>
      Promise.resolve(
        args[0] === "--version"
          ? ok(VERSION_OUT)
          : ok("", "github.com\n  ✓ Logged in to github.com as hubot (oauth_token)\n"),
      ),
    );
    expect(await detectGithubStatus(run)).toMatchObject({
      status: "connected",
      account: "hubot",
    });
  });

  it("connected with an unparseable account → account null", async () => {
    const { run } = fakeRunner((args) =>
      Promise.resolve(args[0] === "--version" ? ok("gh something odd") : ok("all good")),
    );
    expect(await detectGithubStatus(run)).toEqual({
      status: "connected",
      version: null,
      account: null,
      hint: null,
    });
  });
});
