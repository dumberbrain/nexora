import {
  AGENT_TEAMS_ENABLE_CONFIRMATION,
  type EnableAgentTeamsResult,
  EnableAgentTeamsInputSchema,
  type Project,
  type RuntimeEnvironment,
  type TeamView,
} from "@ubuliera/contracts";
import { type Hono } from "hono";

import { type AuditService } from "../../modules/permission-manager/audit.service";
import {
  enableAgentTeams,
  type EnableAgentTeamsOutcome,
} from "../../modules/runtime-manager/agent-teams-settings";
import { type ManagedRuntime } from "../../modules/runtime-manager/runtime-adapter";
import { type AppBindings } from "../context";
import { AppError } from "../errors";
import { readJson } from "../request";

export interface RuntimeRouteDeps {
  runtime: Pick<ManagedRuntime, "environment"> & {
    /** RuntimeManager.invalidateEnvironment — called after Agent Teams were enabled */
    invalidateEnvironment?(): void;
  };
  /** POST /runtime/agent-teams/enable (T138); the route is absent without it */
  agentTeams?: {
    projects: { get(id: string): Pick<Project, "id" | "rootPath"> };
    audit: Pick<AuditService, "record">;
    /** default: merge the flag into `<root>/.claude/settings.local.json` */
    enable?: (projectRoot: string) => Promise<EnableAgentTeamsOutcome>;
  };
  /** GET /sessions/:id/team; the route is absent without it */
  teams?: {
    /** fresh view of a lead this process started; null when not an Agent Teams lead */
    refreshTeam(sessionId: string): Promise<TeamView | null>;
    isLeadSession(sessionId: string): boolean;
  };
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * GET /runtime/environment (T087) — Claude Code version, login state, Agent Teams, runtimes.
 * POST /runtime/agent-teams/enable (T138) — explicit, audited opt-in per project (FR-011).
 * GET /sessions/:id/team (T138) — TeamView of a Ubuliera-started Agent Teams lead.
 */
export function registerRuntimeRoutes(api: Hono<AppBindings>, deps: RuntimeRouteDeps): void {
  api.get("/runtime/environment", async (c) =>
    c.json<RuntimeEnvironment>(await deps.runtime.environment()),
  );

  const agentTeams = deps.agentTeams;
  if (agentTeams) {
    api.post("/runtime/agent-teams/enable", async (c) => {
      const actor = c.get("actor");
      const body = await readJson(c);
      const parsed = EnableAgentTeamsInputSchema.safeParse(body);
      if (!parsed.success) {
        const projectId = (body as { projectId?: unknown } | null)?.projectId;
        agentTeams.audit.record({
          actor,
          action: "runtime.agent_teams.enable",
          targetType: "project",
          targetId: typeof projectId === "string" ? projectId.slice(0, 64) : null,
          outcome: "denied",
          details: { reason: "missing or wrong confirmation" },
        });
        throw new AppError(
          "VALIDATION_FAILED",
          `Type "${AGENT_TEAMS_ENABLE_CONFIRMATION}" to enable Agent Teams`,
          parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
      }
      const project = agentTeams.projects.get(parsed.data.projectId);
      let outcome: EnableAgentTeamsOutcome;
      try {
        outcome = await (agentTeams.enable ?? enableAgentTeams)(project.rootPath);
      } catch (err) {
        agentTeams.audit.record({
          actor,
          action: "runtime.agent_teams.enable",
          targetType: "project",
          targetId: project.id,
          outcome: "failed",
          details: { error: errorText(err) },
        });
        throw new AppError("CONFLICT", `Agent Teams could not be enabled: ${errorText(err)}`);
      }
      agentTeams.audit.record({
        actor,
        action: "runtime.agent_teams.enable",
        targetType: "project",
        targetId: project.id,
        outcome: "success",
        details: { settingsPath: outcome.settingsPath, changed: outcome.changed },
      });
      deps.runtime.invalidateEnvironment?.();
      return c.json<EnableAgentTeamsResult>({ projectId: project.id, ...outcome });
    });
  }

  const teams = deps.teams;
  if (teams) {
    api.get("/sessions/:id/team", async (c) => {
      const id = c.req.param("id");
      if (id.length > 128 || !teams.isLeadSession(id)) {
        throw new AppError(
          "NOT_FOUND",
          "No running Agent Teams lead started by Ubuliera has this id",
        );
      }
      const view = await teams.refreshTeam(id);
      if (!view) throw new AppError("NOT_FOUND", "The lead has not created its team yet");
      return c.json<TeamView>(view);
    });
  }
}
