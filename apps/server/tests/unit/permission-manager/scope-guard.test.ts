import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDb, openDb, type Db } from "../../../src/db/client";
import { AuditService } from "../../../src/modules/permission-manager/audit.service";
import { ScopeGuard } from "../../../src/modules/permission-manager/scope-guard";

let db: Db;
let audit: AuditService;
let tmp: string;
let projectRoot: string;
let cwd: string;
let outside: string;

function guard(ownedPaths: string[] = []) {
  return new ScopeGuard({
    cwd,
    projectRoot,
    ownedPaths,
    audit,
    executionId: "01EXEC",
    taskId: "T-1",
  });
}

const call = (toolName: string, input: Record<string, unknown>, agentId: string | null = null) => ({
  sessionId: "s1",
  agentId,
  toolName,
  input,
});

const audits = () => audit.list({ limit: 50 }).items;

beforeEach(() => {
  db = openDb({ dataDir: ":memory:" });
  audit = new AuditService(db);
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "ubuliera-scope-")));
  projectRoot = join(tmp, "repo");
  cwd = join(projectRoot, ".ubuliera", "worktrees", "01EXEC", "main");
  outside = join(tmp, "elsewhere");
  mkdirSync(join(cwd, "src", "api"), { recursive: true });
  mkdirSync(outside, { recursive: true });
});

afterEach(() => {
  closeDb(db);
  rmSync(tmp, { recursive: true, force: true });
});

describe("ScopeGuard — file writes (FR-034)", () => {
  it("allows writes inside the worktree when no ownedPaths are set", () => {
    for (const tool of ["Write", "Edit", "MultiEdit"]) {
      expect(guard().check(call(tool, { file_path: join(cwd, "src", "a.ts") }))).toEqual({
        decision: "allow",
      });
    }
    expect(guard().check(call("NotebookEdit", { notebook_path: join(cwd, "n.ipynb") }))).toEqual({
      decision: "allow",
    });
    expect(audits()).toHaveLength(0);
  });

  it("resolves relative paths against the worktree", () => {
    expect(guard().check(call("Write", { file_path: "src/new.ts" })).decision).toBe("allow");
    expect(guard().check(call("Write", { file_path: "../../../../x.ts" })).decision).toBe("deny");
  });

  it("denies writes outside the worktree and records an audit entry", () => {
    const d = guard().check(call("Write", { file_path: join(outside, "evil.ts") }));
    expect(d.decision).toBe("deny");
    const entries = audits();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actor: "system",
      action: "scope.deny",
      targetType: "session",
      targetId: "s1",
      outcome: "denied",
    });
  });

  it("denies writes to the project root itself (only worktrees are writable)", () => {
    const d = guard().check(call("Edit", { file_path: join(projectRoot, "README.md") }));
    expect(d.decision).toBe("deny");
  });

  it("enforces ownedPaths globs relative to the worktree", () => {
    const g = guard(["src/api/**"]);
    expect(g.check(call("Write", { file_path: join(cwd, "src", "api", "x.ts") })).decision).toBe(
      "allow",
    );
    const d = g.check(call("Write", { file_path: join(cwd, "src", "other.ts") }));
    expect(d.decision).toBe("deny");
    if (d.decision === "deny") expect(d.reason).toMatch(/owned/i);
    expect(audits()).toHaveLength(1);
  });

  it("denies a write that escapes through a symlink/junction", () => {
    const link = join(cwd, "link");
    symlinkSync(outside, link, "junction");
    const d = guard().check(call("Write", { file_path: join(link, "evil.ts") }));
    expect(d.decision).toBe("deny");
  });

  it("denies a file tool call without a usable path", () => {
    expect(guard().check(call("Write", { content: "x" })).decision).toBe("deny");
    expect(guard().check(call("Edit", { file_path: 42 })).decision).toBe("deny");
  });

  it("applies the same rules to subagent calls", () => {
    const d = guard().check(call("Write", { file_path: join(outside, "x") }, "toolu_1"));
    expect(d.decision).toBe("deny");
  });
});

describe("ScopeGuard — shell tools (S3)", () => {
  it("routes Bash and PowerShell to the approval gate, never auto-allows", () => {
    for (const tool of ["Bash", "PowerShell"]) {
      const d = guard().check(call(tool, { command: "npm test" }));
      expect(d).toMatchObject({ decision: "ask", riskClass: "normal" });
      if (d.decision === "ask") expect(d.reason).toContain("npm test");
    }
  });

  it("truncates and redacts the command in the reason", () => {
    const d = guard().check(
      call("Bash", {
        command: `curl -H "Authorization: Bearer abcdef1234567890" ${"x".repeat(500)}`,
      }),
    );
    expect(d.decision).toBe("ask");
    if (d.decision === "ask") {
      expect(d.reason).not.toContain("abcdef1234567890");
      expect(d.reason.length).toBeLessThan(400);
    }
  });
});

describe("ScopeGuard — reads", () => {
  it("allows reads inside the project or worktree and calls without a path", () => {
    expect(
      guard().check(call("Read", { file_path: join(projectRoot, "README.md") })).decision,
    ).toBe("allow");
    expect(guard().check(call("Grep", { pattern: "x", path: cwd })).decision).toBe("allow");
    expect(guard().check(call("Glob", { pattern: "**/*.ts" })).decision).toBe("allow");
  });

  it("denies reads outside the project and audits them", () => {
    const d = guard().check(call("Read", { file_path: join(outside, "secret.txt") }));
    expect(d.decision).toBe("deny");
    expect(audits()).toHaveLength(1);
  });
});

describe("ScopeGuard — other tools", () => {
  it("asks for outward-facing, MCP and unknown tools", () => {
    for (const tool of ["WebFetch", "WebSearch", "mcp__github__create_issue", "SomethingNew"]) {
      expect(guard().check(call(tool, {})).decision).toBe("ask");
    }
  });

  it("allows orchestration-only tools", () => {
    for (const tool of ["Agent", "Task", "TodoWrite"]) {
      expect(guard().check(call(tool, {})).decision).toBe("allow");
    }
  });
});
