import { type PlanConflict } from "@ubuliera/contracts";
import picomatch from "picomatch";

import { ancestorsByNode, type DagNode } from "../../task-manager/task-state";

const PM_OPTS = { dot: true } as const;

const norm = (glob: string) => glob.trim().replace(/\\/g, "/").replace(/^\.\//, "");

/** Static directory/file prefix of a glob ("" when it starts with a wildcard). */
function staticBase(glob: string): { base: string; dynamic: boolean } {
  const scan = picomatch.scan(glob);
  return { base: scan.isGlob ? scan.base : glob, dynamic: scan.isGlob };
}

/** a is b, or a directory containing b (path-segment aware). */
function contains(a: string, b: string): boolean {
  return a === "" || a === b || b.startsWith(`${a}/`);
}

/**
 * Could two ownedPaths globs match a common file? Conservative: a false positive only costs
 * parallelism, a false negative could let two sessions edit the same file.
 */
export function globsOverlap(rawA: string, rawB: string): boolean {
  const a = norm(rawA);
  const b = norm(rawB);
  if (a === b) return true;
  if (picomatch(a, PM_OPTS)(b) || picomatch(b, PM_OPTS)(a)) return true;
  const sa = staticBase(a);
  const sb = staticBase(b);
  if (!sa.dynamic && !sb.dynamic) return false;
  // a wildcard below a static base may reach anything under that base
  return (sa.dynamic && contains(sa.base, sb.base)) || (sb.dynamic && contains(sb.base, sa.base));
}

export interface ConflictNode extends DagNode {
  ownedPaths: readonly string[];
}

/**
 * Tasks that may run in parallel (neither depends on the other, transitively) and own
 * overlapping paths are flagged before execution (FR-007).
 */
export function detectConflicts(
  tasks: readonly ConflictNode[],
  resolution: PlanConflict["resolution"],
): PlanConflict[] {
  const ancestors = ancestorsByNode(tasks);
  const conflicts: PlanConflict[] = [];
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      const a = tasks[i] as ConflictNode;
      const b = tasks[j] as ConflictNode;
      if (ancestors.get(a.id)?.has(b.id) || ancestors.get(b.id)?.has(a.id)) continue;
      const paths = new Set<string>();
      for (const pa of a.ownedPaths) {
        for (const pb of b.ownedPaths) {
          if (globsOverlap(pa, pb)) {
            paths.add(pa);
            paths.add(pb);
          }
        }
      }
      if (paths.size > 0) conflicts.push({ taskIds: [a.id, b.id], paths: [...paths], resolution });
    }
  }
  return conflicts;
}
