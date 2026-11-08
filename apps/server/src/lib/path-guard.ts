import { realpath } from "node:fs/promises";
import path from "node:path";

export class PathGuardError extends Error {
  override readonly name = "PathGuardError";
}

type Platform = "posix" | "win32";

const currentPlatform = (): Platform => (process.platform === "win32" ? "win32" : "posix");

/**
 * Lexical check: is `target` the `root` itself or inside it? Rejects relative inputs, `..`
 * escapes, sibling prefixes (`/repo-evil`), other drives and foreign UNC shares.
 * win32 comparison is case-insensitive and accepts both separators.
 */
export function isInsideRoot(
  root: string,
  target: string,
  platform: Platform = currentPlatform(),
): boolean {
  const p = platform === "win32" ? path.win32 : path.posix;
  if (!p.isAbsolute(root) || !p.isAbsolute(target)) return false;
  const norm = (s: string) => {
    const r = p.resolve(s);
    return platform === "win32" ? r.toLowerCase() : r;
  };
  const rel = p.relative(norm(root), norm(target));
  if (rel === "") return true;
  if (p.isAbsolute(rel)) return false;
  return rel !== ".." && !rel.startsWith(`..${p.sep}`);
}

/** Real path of `target`, resolving symlinks/junctions of the longest existing ancestor. */
async function realpathAllowMissing(target: string): Promise<string> {
  const missing: string[] = [];
  let current = path.resolve(target);
  for (;;) {
    try {
      const real = await realpath(current);
      return missing.length ? path.join(real, ...missing.reverse()) : real;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      const parent = path.dirname(current);
      if (parent === current) throw err;
      missing.push(path.basename(current));
      current = parent;
    }
  }
}

/**
 * Resolve `target` and prove it stays inside `root` after following symlinks/junctions.
 * Non-existent files are allowed (writes) as long as their existing ancestor is inside.
 * Throws PathGuardError otherwise. Returns the real, absolute path.
 */
export async function resolveInsideRoot(root: string, target: string): Promise<string> {
  if (!isInsideRoot(root, target)) {
    throw new PathGuardError(`Path is outside the allowed root: ${target}`);
  }
  const realRoot = await realpath(root);
  const realTarget = await realpathAllowMissing(target);
  if (!isInsideRoot(realRoot, realTarget)) {
    throw new PathGuardError(`Path escapes the allowed root via a link: ${target}`);
  }
  return realTarget;
}
