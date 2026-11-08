import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PathGuardError, isInsideRoot, resolveInsideRoot } from "../../../src/lib/path-guard";

describe("isInsideRoot (pure, platform-explicit)", () => {
  it("accepts the root itself and descendants (posix)", () => {
    expect(isInsideRoot("/repo", "/repo", "posix")).toBe(true);
    expect(isInsideRoot("/repo", "/repo/src/a.ts", "posix")).toBe(true);
  });

  it("rejects traversal and sibling prefixes (posix)", () => {
    expect(isInsideRoot("/repo", "/repo/../etc/passwd", "posix")).toBe(false);
    expect(isInsideRoot("/repo", "/repo-evil/a.ts", "posix")).toBe(false);
    expect(isInsideRoot("/repo", "/etc", "posix")).toBe(false);
  });

  it("is case-sensitive on posix", () => {
    expect(isInsideRoot("/Repo", "/repo/a", "posix")).toBe(false);
  });

  it("is case-insensitive and separator-agnostic on win32", () => {
    expect(isInsideRoot("C:\\Users\\u\\Repo", "c:/users/u/repo/src/a.ts", "win32")).toBe(true);
    expect(isInsideRoot("C:\\repo", "C:\\repo\\..\\Windows\\system32", "win32")).toBe(false);
  });

  it("rejects other drives and UNC paths outside the root (win32)", () => {
    expect(isInsideRoot("C:\\repo", "D:\\repo\\a.ts", "win32")).toBe(false);
    expect(isInsideRoot("C:\\repo", "\\\\server\\share\\repo", "win32")).toBe(false);
    expect(isInsideRoot("\\\\server\\share\\repo", "\\\\server\\share\\repo\\a", "win32")).toBe(
      true,
    );
  });

  it("rejects relative inputs", () => {
    expect(isInsideRoot("/repo", "src/a.ts", "posix")).toBe(false);
  });
});

describe("resolveInsideRoot (real filesystem, follows symlinks)", () => {
  let base: string;
  let root: string;
  let outside: string;
  let canSymlink = true;

  beforeAll(() => {
    base = mkdtempSync(join(tmpdir(), "nexora-pathguard-"));
    root = join(base, "root");
    outside = join(base, "outside");
    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(outside);
    writeFileSync(join(root, "src", "a.ts"), "x");
    writeFileSync(join(outside, "secret.txt"), "x");
    try {
      // "junction" works without admin rights on Windows; ignored on posix
      symlinkSync(outside, join(root, "escape"), "junction");
    } catch {
      canSymlink = false;
    }
  });

  afterAll(() => rmSync(base, { recursive: true, force: true }));

  it("returns the real path for files inside the root", async () => {
    const p = await resolveInsideRoot(root, join(root, "src", "a.ts"));
    expect(p.toLowerCase()).toContain("a.ts");
  });

  it("allows not-yet-existing files inside the root (for writes)", async () => {
    await expect(resolveInsideRoot(root, join(root, "src", "new.ts"))).resolves.toContain("new.ts");
  });

  it("rejects traversal", async () => {
    await expect(
      resolveInsideRoot(root, join(root, "..", "outside", "secret.txt")),
    ).rejects.toThrow(PathGuardError);
  });

  it("rejects a symlink/junction that escapes the root", async () => {
    if (!canSymlink) return;
    await expect(resolveInsideRoot(root, join(root, "escape", "secret.txt"))).rejects.toThrow(
      PathGuardError,
    );
  });
});
