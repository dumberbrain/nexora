import { describe, expect, it } from "vitest";

import {
  detectConflicts,
  globsOverlap,
} from "../../../src/modules/execution-orchestrator/planner/conflict-detector";

describe("globsOverlap", () => {
  it.each([
    ["src/**", "src/api/user.ts"],
    ["**", "docs/README.md"],
    ["src/api/**", "src/api/**"],
    ["src/**/*.ts", "src/web/**"],
    ["apps/web/src/**", "apps/web/**/*.tsx"],
    ["package.json", "package.json"],
  ])("%s overlaps %s", (a, b) => {
    expect(globsOverlap(a, b)).toBe(true);
    expect(globsOverlap(b, a)).toBe(true);
  });

  it.each([
    ["src/web/**", "src/api/**"],
    ["docs/**", "src/**"],
    ["apps/web/**", "apps/server/**"],
    ["package.json", "src/**"],
    ["src/a.ts", "src/b.ts"],
  ])("%s does not overlap %s", (a, b) => {
    expect(globsOverlap(a, b)).toBe(false);
    expect(globsOverlap(b, a)).toBe(false);
  });
});

describe("detectConflicts", () => {
  const t = (id: string, ownedPaths: string[], dependsOn: string[] = []) => ({
    id,
    ownedPaths,
    dependsOn,
  });

  it("flags overlapping ownedPaths between tasks that may run in parallel", () => {
    const conflicts = detectConflicts(
      [t("T-1", ["src/api/**"]), t("T-2", ["src/api/users.ts", "docs/**"]), t("T-3", ["web/**"])],
      "serialised",
    );
    expect(conflicts).toEqual([
      {
        taskIds: ["T-1", "T-2"],
        paths: ["src/api/**", "src/api/users.ts"],
        resolution: "serialised",
      },
    ]);
  });

  it("does not flag non-overlapping tasks", () => {
    expect(
      detectConflicts([t("T-1", ["apps/web/**"]), t("T-2", ["apps/server/**"])], "serialised"),
    ).toEqual([]);
  });

  it("does not flag tasks ordered by a (transitive) dependency — they never run in parallel", () => {
    const conflicts = detectConflicts(
      [t("T-1", ["**"]), t("T-2", ["**"], ["T-1"]), t("T-3", ["**"], ["T-2"])],
      "separate_worktrees",
    );
    expect(conflicts).toEqual([]);
  });

  it("uses the requested resolution", () => {
    const [c] = detectConflicts([t("T-1", ["**"]), t("T-2", ["src/**"])], "separate_worktrees");
    expect(c?.resolution).toBe("separate_worktrees");
  });
});
