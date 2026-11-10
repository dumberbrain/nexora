import { type Project } from "@ubuliera/contracts";
import { asc, eq } from "drizzle-orm";

import { type Db } from "../../db/client";
import { projects } from "../../db/schema";
import { isInsideRoot } from "../../lib/path-guard";

export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;

/** Public DTO — the hook token hash never leaves the server. */
export function toProject(row: ProjectRow): Project {
  const { hookTokenHash: _hash, ...project } = row;
  return project;
}

/** Path comparison mode for a stored root: Windows paths compare case-insensitively. */
const platformOf = (p: string) => (/^[A-Za-z]:[\\/]|^\\\\/.test(p) ? "win32" : "posix");

export class ProjectRepository {
  constructor(private readonly db: Db) {}

  list(): ProjectRow[] {
    return this.db.select().from(projects).orderBy(asc(projects.createdAt)).all();
  }

  get(id: string): ProjectRow | undefined {
    return this.db.select().from(projects).where(eq(projects.id, id)).get();
  }

  findByRoot(rootPath: string): ProjectRow | undefined {
    const platform = platformOf(rootPath);
    return this.list().find(
      (p) =>
        platformOf(p.rootPath) === platform &&
        isInsideRoot(p.rootPath, rootPath, platform) &&
        isInsideRoot(rootPath, p.rootPath, platform),
    );
  }

  findByTokenHash(hash: string): ProjectRow | undefined {
    return this.db.select().from(projects).where(eq(projects.hookTokenHash, hash)).get();
  }

  /** The most specific registered project whose root contains `cwd`. */
  findContaining(cwd: string): ProjectRow | undefined {
    const platform = platformOf(cwd);
    return this.list()
      .filter((p) => platformOf(p.rootPath) === platform && isInsideRoot(p.rootPath, cwd, platform))
      .sort((a, b) => b.rootPath.length - a.rootPath.length)[0];
  }

  insert(row: NewProjectRow): ProjectRow {
    this.db.insert(projects).values(row).run();
    const saved = this.get(row.id);
    if (!saved) throw new Error(`project ${row.id} vanished after insert`);
    return saved;
  }

  setHooks(id: string, installed: boolean, tokenHash: string | null): ProjectRow | undefined {
    this.db
      .update(projects)
      .set({ hooksInstalled: installed, hookTokenHash: tokenHash })
      .where(eq(projects.id, id))
      .run();
    return this.get(id);
  }
}
