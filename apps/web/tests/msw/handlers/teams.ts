import {
  AGENT_TEAMS_ENABLE_CONFIRMATION,
  type Agent,
  type AgentDetail,
  type ApiErrorBody,
  type EnableAgentTeamsInput,
  type EnableAgentTeamsResult,
  type ExecutionTasks,
  type RuntimeCapabilityProfile,
  type Session,
  type TeamView,
} from "@ubuliera/contracts";
import { http, HttpResponse } from "msw";

import { planFixture } from "./executions";
import { sessionFixtures } from "./sessions";

/*
 * US6 fixtures modelled on the S2 run (apps/server/tests/fixtures/teams/, team
 * `session-9da5d295`: a lead + teammate-one + teammate-two writing hello.txt / bye.txt).
 */

const NOW = Date.UTC(2026, 10, 9, 12, 0, 0);
export const TEAM_LEAD_SESSION_ID = "9da5d295-d920-41ad-899a-7b0b1b4a8d68";
const TEAM = "session-9da5d295";

/** runtime-adapter.md matrix, column agent_team_pty. */
export const teamPtyCapabilities: RuntimeCapabilityProfile = {
  runtime: "agent_team_pty",
  canStart: true,
  canStop: true,
  canInterrupt: true,
  canPause: false,
  canResume: false,
  canRestart: false,
  canSendMessage: "lead_only",
  canSetPermissionMode: false,
  emitsEvents: ["session.started", "agent.spawned", "agent.waiting", "message.sent"],
  reportsUsage: "none",
  notes: ["interactive lead in a PTY; team state read from ~/.claude/teams (best effort)"],
};

export const teamLeadSessionFixture: Session = {
  ...sessionFixtures[0]!,
  id: TEAM_LEAD_SESSION_ID,
  executionId: "01JCXK0000000000000000X004",
  executionMode: "agent_teams",
  currentTaskId: "T-1",
  runtime: "agent_team_pty",
  observeOnly: false,
  worktreePath: "C:/work/ubuliera/.ubuliera/worktrees/X004/T-1",
  capabilities: teamPtyCapabilities,
  status: "running",
  pid: 6944,
  lastActivityAt: NOW - 2_000,
  startedAt: NOW - 32_000,
};

const agent = (p: Pick<Agent, "id" | "name" | "kind" | "status"> & Partial<Agent>): Agent => ({
  sessionId: TEAM_LEAD_SESSION_ID,
  parentAgentId: null,
  role: null,
  definitionPath: null,
  currentTaskId: null,
  summary: null,
  ...p,
});

export const teamAgentFixtures: Agent[] = [
  agent({
    id: `team-lead@${TEAM}`,
    name: "team-lead",
    kind: "team_lead",
    status: "running",
    currentTaskId: "T-1",
  }),
  agent({
    id: "teammate-one",
    name: "teammate-one",
    kind: "teammate",
    status: "running",
    parentAgentId: `team-lead@${TEAM}`,
  }),
  agent({
    id: "teammate-two",
    name: "teammate-two",
    kind: "teammate",
    status: "idle",
    parentAgentId: `team-lead@${TEAM}`,
  }),
];

export const teamLeadDetailFixture: AgentDetail = {
  agent: teamAgentFixtures[0]!,
  session: teamLeadSessionFixture,
  children: teamAgentFixtures.slice(1),
  filesChanged: [],
};

export const teamViewFixture: TeamView = {
  sessionId: TEAM_LEAD_SESSION_ID,
  teamName: TEAM,
  members: [
    {
      agentId: `team-lead@${TEAM}`,
      name: "team-lead",
      agentType: "team-lead",
      isLead: true,
      status: "active",
      joinedAt: NOW - 30_000,
      cwd: "C:/work/ubuliera",
    },
    {
      agentId: `teammate-one@${TEAM}`,
      name: "teammate-one",
      agentType: "general-purpose",
      isLead: false,
      status: "active",
      joinedAt: NOW - 12_000,
      cwd: "C:/work/ubuliera",
    },
    {
      agentId: `teammate-two@${TEAM}`,
      name: "teammate-two",
      agentType: "general-purpose",
      isLead: false,
      status: "idle",
      joinedAt: NOW - 11_000,
      cwd: "C:/work/ubuliera",
    },
  ],
  tasks: [
    { id: "1", subject: "Write hello.txt", status: "in_progress", owner: "teammate-one" },
    { id: "2", subject: "Write bye.txt", status: "completed", owner: "teammate-two" },
  ],
  messages: [
    {
      id: "m-1",
      from: "teammate-two",
      to: "team-lead",
      kind: "idle_notification",
      summary: "teammate-two is idle",
      ts: NOW - 4_000,
    },
  ],
  reliability: "best_effort",
  updatedAt: NOW - 1_000,
};

/** A hybrid plan (US6): each task names its mechanism and why the planner chose it. */
export const hybridPlanFixture: ExecutionTasks = {
  items: [
    {
      ...planFixture.items[0]!,
      mode: "agent_teams",
      mechanismReason: "UI and store must agree on one API — teammates negotiate it",
    },
    {
      ...planFixture.items[1]!,
      mode: "subagents",
      mechanismReason: "a focused migration for the database-engineer specialist",
    },
    { ...planFixture.items[2]!, mode: "multi_session", mechanismReason: null },
  ],
  conflicts: [],
};

export const enableResultFixture: EnableAgentTeamsResult = {
  projectId: "01JCXK0000000000000000P001",
  settingsPath: "C:/work/ubuliera/.claude/settings.local.json",
  changed: true,
};

const noTeam: ApiErrorBody = { error: { code: "NOT_FOUND", message: "no team for this session" } };
const badPhrase: ApiErrorBody = {
  error: {
    code: "VALIDATION_FAILED",
    message: `confirmation must be "${AGENT_TEAMS_ENABLE_CONFIRMATION}"`,
  },
};

export const teamHandlers = [
  http.get("*/api/v1/sessions/:id/team", ({ params }) =>
    params.id === TEAM_LEAD_SESSION_ID
      ? HttpResponse.json<TeamView>(teamViewFixture)
      : HttpResponse.json(noTeam, { status: 404 }),
  ),
  http.post("*/api/v1/runtime/agent-teams/enable", async ({ request }) => {
    const body = (await request.json()) as EnableAgentTeamsInput;
    if (body.confirmation !== AGENT_TEAMS_ENABLE_CONFIRMATION) {
      return HttpResponse.json(badPhrase, { status: 400 });
    }
    return HttpResponse.json<EnableAgentTeamsResult>({
      ...enableResultFixture,
      projectId: body.projectId,
    });
  }),
];
