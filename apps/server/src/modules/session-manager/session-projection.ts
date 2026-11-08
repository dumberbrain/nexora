import { type Session, type SessionStatus } from "@nexora/contracts";

import { EXTERNAL_OBSERVED_CAPABILITIES } from "./capabilities";
import { type GitBranchResolver } from "./git-branch";
import { type SessionRepository } from "./session.repository";
import { type Logger } from "../../lib/logger";
import { type EventBus } from "../event-manager/event-bus";
import { type ProjectRepository } from "../project-registry/project.repository";

/** One hook delivery, reduced to what the session projection needs. */
export interface SessionObservation {
  sessionId: string;
  hookEventName: string;
  cwd: string;
  /** project whose hook token authenticated the delivery */
  tokenProjectId: string;
  ts: number;
}

/** Hook events that leave the session status as it is (they are not "work"). */
const PASSIVE = new Set(["Notification", "TeammateIdle", "CwdChanged"]);

/**
 * Status after a hook event: activity → running, Stop → idle, PermissionRequest →
 * waiting_for_approval, StopFailure → failed, SessionEnd → stopped.
 */
export function nextSessionStatus(current: SessionStatus | null, hook: string): SessionStatus {
  switch (hook) {
    case "SessionEnd":
      return "stopped";
    case "StopFailure":
      return "failed";
    case "Stop":
      return "idle";
    case "PermissionRequest":
      return "waiting_for_approval";
    default:
      return PASSIVE.has(hook) && current !== null ? current : "running";
  }
}

export interface SessionProjectionDeps {
  sessions: SessionRepository;
  projects: ProjectRepository;
  bus: EventBus;
  gitBranch: GitBranchResolver;
  logger: Logger;
}

/**
 * Session manager projection for observed sessions (T058). Creates a session on the first event
 * of any type for an unknown session id (S1: SessionStart never reaches http hooks), keeps status
 * and activity current and publishes `entity.changed` patches.
 */
export class SessionProjection {
  private readonly pending = new Set<Promise<void>>();

  constructor(private readonly deps: SessionProjectionDeps) {}

  apply(o: SessionObservation): Session {
    const current = this.deps.sessions.get(o.sessionId);
    if (!current) return this.create(o);

    const status = nextSessionStatus(current.status, o.hookEventName);
    const patch: Partial<Session> = {};
    if (status !== current.status) patch.status = status;
    if (o.ts > current.lastActivityAt) patch.lastActivityAt = o.ts;
    if (status === "stopped" && current.endedAt === null) patch.endedAt = o.ts;
    if (status !== "stopped" && current.endedAt !== null) patch.endedAt = null;
    if (o.hookEventName === "CwdChanged" && o.cwd !== current.cwd) patch.cwd = o.cwd;

    this.deps.sessions.update(o.sessionId, patch);
    this.publish(o.sessionId, patch);
    return { ...current, ...patch };
  }

  /** Resolves when all background git lookups have finished (tests, shutdown). */
  async settled(): Promise<void> {
    await Promise.all([...this.pending]);
  }

  private create(o: SessionObservation): Session {
    const project =
      this.deps.projects.findContaining(o.cwd) ?? this.deps.projects.get(o.tokenProjectId);
    const status = nextSessionStatus(null, o.hookEventName);
    const session: Session = {
      id: o.sessionId,
      executionId: null,
      projectId: project?.id ?? null,
      runtime: "external_observed",
      observeOnly: true,
      cwd: o.cwd,
      gitBranch: null,
      worktreePath: null,
      model: null,
      status,
      capabilities: EXTERNAL_OBSERVED_CAPABILITIES,
      pid: null,
      usage: null,
      lastActivityAt: o.ts,
      startedAt: o.ts,
      endedAt: status === "stopped" ? o.ts : null,
    };
    this.deps.sessions.insert(session);
    this.publish(session.id, session);
    if (project) this.lookupBranch(session.id, o.cwd, project.rootPath);
    return session;
  }

  /** Fire-and-forget: ingest never waits for git. */
  private lookupBranch(sessionId: string, cwd: string, root: string): void {
    const task = this.deps
      .gitBranch(cwd, root)
      .then((gitBranch) => {
        if (gitBranch === null) return;
        this.deps.sessions.update(sessionId, { gitBranch });
        this.publish(sessionId, { gitBranch });
      })
      .catch((err: unknown) => {
        this.deps.logger.debug({ err, sessionId }, "git branch lookup failed");
      })
      .finally(() => this.pending.delete(task));
    this.pending.add(task);
  }

  private publish(id: string, patch: Partial<Session>): void {
    if (Object.keys(patch).length === 0) return;
    this.deps.bus.publishEntityChanged({ kind: "session", id, patch: { ...patch } });
  }
}
