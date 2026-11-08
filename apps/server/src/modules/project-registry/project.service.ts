import { realpath, stat } from "node:fs/promises";
import { basename } from "node:path";

import { type Project, type RegisterProjectInput } from "@nexora/contracts";

import { type ProjectRepository, type ProjectRow, toProject } from "./project.repository";
import { detectInstructionFiles, detectStack } from "./stack-detector";
import { AppError } from "../../http/errors";
import { newId } from "../../lib/ulid";
import { type AuditService } from "../permission-manager/audit.service";

const MAX_NAME = 120;

/** Real, absolute path of an existing directory — or a VALIDATION_FAILED error. */
async function realDirectory(rootPath: string): Promise<string> {
  let real: string;
  try {
    real = await realpath(rootPath);
  } catch {
    throw new AppError("VALIDATION_FAILED", "rootPath does not exist", [
      { path: "rootPath", message: "must be an existing directory" },
    ]);
  }
  if (!(await stat(real)).isDirectory()) {
    throw new AppError("VALIDATION_FAILED", "rootPath is not a directory", [
      { path: "rootPath", message: "must be an existing directory" },
    ]);
  }
  return real;
}

/** Project registry (T055): registration with path validation, uniqueness and audit. */
export class ProjectService {
  constructor(
    private readonly repo: ProjectRepository,
    private readonly audit: AuditService,
    private readonly now: () => number = Date.now,
  ) {}

  list(): Project[] {
    return this.repo.list().map(toProject);
  }

  /** Row incl. internal fields, or NOT_FOUND. */
  getRow(id: string): ProjectRow {
    const row = this.repo.get(id);
    if (!row) throw new AppError("NOT_FOUND", "Project not found");
    return row;
  }

  get(id: string): Project {
    return toProject(this.getRow(id));
  }

  async register(input: RegisterProjectInput, actor: string): Promise<Project> {
    const rootPath = await realDirectory(input.rootPath);
    if (this.repo.findByRoot(rootPath)) {
      this.audit.record({
        actor,
        action: "project.register",
        targetType: "project",
        outcome: "failed",
        details: { rootPath, reason: "already registered" },
      });
      throw new AppError("CONFLICT", "A project with this rootPath is already registered");
    }
    const name = (input.name ?? (basename(rootPath) || rootPath)).slice(0, MAX_NAME);
    const now = this.now();
    const row = this.repo.insert({
      id: newId(now),
      name,
      rootPath,
      detectedStack: await detectStack(rootPath),
      instructionFiles: await detectInstructionFiles(rootPath),
      hooksInstalled: false,
      hookTokenHash: null,
      createdAt: now,
      lastAnalyzedAt: now,
    });
    this.audit.record({
      actor,
      action: "project.register",
      targetType: "project",
      targetId: row.id,
      outcome: "success",
      details: { rootPath, name },
    });
    return toProject(row);
  }
}
