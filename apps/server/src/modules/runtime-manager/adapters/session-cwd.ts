import { isInsideRoot, PathGuardError } from "../../../lib/path-guard";
import { type StartSessionInput } from "../runtime-adapter";

/**
 * A managed session's `cwd` must be the project root or inside it (its Nexora worktree lives at
 * `<repo>/.nexora/worktrees/...`). Lexical check only — the scope guard does the symlink-safe
 * checks for every write. Throws PathGuardError.
 */
export function assertSessionCwd(input: Pick<StartSessionInput, "projectRoot" | "cwd">): void {
  if (!isInsideRoot(input.projectRoot, input.cwd)) {
    throw new PathGuardError(`Session cwd is outside the project: ${input.cwd}`);
  }
}
