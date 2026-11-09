import {
  type ApiErrorBody,
  type ApproveExecutionInput,
  type Execution,
  type ExecutionConfig,
  type ExecutionList,
  type ExecutionTasks,
  type GeneratePlanInput,
  type ModeOption,
  type Question,
  type SetModeInput,
  type Task,
  type Verification,
} from "@nexora/contracts";
import { http, HttpResponse } from "msw";

const NOW = Date.UTC(2026, 10, 8, 12, 0, 0);
const P1 = "01JCXK0000000000000000P001";

export const defaultConfig: ExecutionConfig = {
  parallelism: "parallel",
  approvalCheckpoints: true,
  maxParallelSessions: 4,
  idleTimeoutMs: 600_000,
  turnTimeoutMs: 1_800_000,
  modelAnalysisConsent: false,
  runTestsOnVerify: false,
  answers: {},
};

const base: Execution = {
  id: "01JCXK0000000000000000X001",
  projectId: P1,
  prompt: "Add a dark-mode toggle to the settings page with tests",
  analysis: {
    stack: {
      languages: ["typescript"],
      frameworks: ["react", "hono"],
      packageManager: "npm",
      testRunners: ["vitest", "playwright"],
    },
    instructionFiles: ["CLAUDE.md", "apps/web/CLAUDE.md"],
    skills: ["team-frontend", "speckit-plan"],
    agents: ["code-reviewer"],
    mcpServers: ["playwright"],
    complexity: "medium",
    summary: "UI change in apps/web plus a settings store; touches 3–5 files.",
    modelAssisted: false,
  },
  mode: null,
  strategy: null,
  config: defaultConfig,
  status: "awaiting_mode",
  permissionBypass: false,
  worktreePath: null,
  verification: null,
  createdAt: NOW - 60_000,
  startedAt: null,
  endedAt: null,
};

export const verificationFixture: Verification = {
  completedTaskIds: ["T-1", "T-2"],
  failedTaskIds: ["T-3"],
  changedFiles: ["apps/web/src/features/toggle-theme/ui/theme-toggle.tsx"],
  testResults: { passed: 41, failed: 1, skipped: 2 },
};

export const executionFixtures: Execution[] = [
  base,
  {
    ...base,
    id: "01JCXK0000000000000000X002",
    prompt: "Build a SaaS app with auth, subscriptions, admin dashboard and payments",
    mode: "multi_session",
    strategy: "plan_first",
    status: "running",
    worktreePath: "C:/work/nexora/.nexora/worktrees/X002",
    createdAt: NOW - 600_000,
    startedAt: NOW - 500_000,
  },
  {
    ...base,
    id: "01JCXK0000000000000000X003",
    prompt: "Fix flaky session staleness test",
    mode: "subagents",
    strategy: "tdd",
    status: "completed",
    verification: verificationFixture,
    createdAt: NOW - 7_200_000,
    startedAt: NOW - 7_100_000,
    endedAt: NOW - 6_000_000,
  },
];

export const modeFixtures: ModeOption[] = [
  {
    mode: "multi_session",
    available: true,
    recommended: true,
    reason: "Independent UI and store changes can run in parallel sessions.",
    unavailableReason: null,
    howToEnable: null,
    runtimes: ["agent_sdk"],
  },
  {
    mode: "subagents",
    available: true,
    recommended: false,
    reason: "Works, but one context window for all tasks.",
    unavailableReason: null,
    howToEnable: null,
    runtimes: ["agent_sdk"],
  },
  {
    mode: "agent_teams",
    available: false,
    recommended: false,
    reason: "Teammates could split UI and tests.",
    unavailableReason: "Agent Teams are disabled in this environment",
    howToEnable: "Set CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 and restart Nexora",
    runtimes: ["agent_team_pty"],
  },
];

export const questionFixtures: Question[] = [
  {
    key: "parallelism",
    kind: "single",
    label: "Run tasks sequentially or in parallel?",
    help: null,
    options: [
      { value: "sequential", label: "Sequential", description: null },
      { value: "parallel", label: "Parallel", description: "Independent tasks at once" },
      { value: "hybrid", label: "Hybrid", description: null },
    ],
    recommendedDefault: "parallel",
    min: null,
    max: null,
  },
  {
    key: "maxParallelSessions",
    kind: "number",
    label: "Maximum parallel sessions",
    help: "Up to 8",
    options: null,
    recommendedDefault: 3,
    min: 1,
    max: 8,
  },
  {
    key: "approvalCheckpoints",
    kind: "boolean",
    label: "Pause for approval between phases",
    help: null,
    options: null,
    recommendedDefault: true,
    min: null,
    max: null,
  },
  {
    key: "answers.skills",
    kind: "multi",
    label: "Skills to load",
    help: null,
    options: [
      { value: "team-frontend", label: "team-frontend", description: null },
      { value: "speckit-plan", label: "speckit-plan", description: null },
    ],
    recommendedDefault: ["team-frontend"],
    min: null,
    max: null,
  },
  {
    key: "answers.notes",
    kind: "text",
    label: "Anything else the agents should know?",
    help: null,
    options: null,
    recommendedDefault: "",
    min: null,
    max: null,
  },
];

const task = (p: Pick<Task, "id" | "title"> & Partial<Task>): Task => ({
  executionId: base.id,
  description: `${p.title} — details`,
  assignedAgentRole: "implementer",
  agentId: null,
  mode: "multi_session",
  mechanismReason: null,
  priority: "p2",
  status: "pending",
  dependsOn: [],
  ownedPaths: ["apps/web/src/**"],
  riskClass: "normal",
  changedFiles: [],
  testResults: null,
  attempt: 1,
  previousAttemptId: null,
  startedAt: null,
  completedAt: null,
  ...p,
});

export const planFixture: ExecutionTasks = {
  items: [
    task({ id: "T-1", title: "Add theme store", priority: "p1" }),
    task({
      id: "T-2",
      title: "Drop legacy settings table",
      dependsOn: ["T-1"],
      riskClass: "destructive",
      ownedPaths: ["apps/server/drizzle/**"],
    }),
    task({ id: "T-3", title: "Wire toggle into settings page", riskClass: "deploy" }),
  ],
  conflicts: [{ taskIds: ["T-1", "T-3"], paths: ["apps/web/src/**"], resolution: "serialised" }],
};

const notFound: ApiErrorBody = { error: { code: "NOT_FOUND", message: "execution not found" } };
const consentRequired: ApiErrorBody = {
  error: { code: "APPROVAL_REQUIRED", message: "model-assisted planning consumes model usage" },
};

const byId = (id: unknown) => executionFixtures.find((e) => e.id === id);
const withExecution =
  (fn: (e: Execution, body: unknown) => Execution) =>
  async ({ params, request }: { params: Record<string, unknown>; request: Request }) => {
    const found = byId(params.id);
    if (!found) return HttpResponse.json(notFound, { status: 404 });
    const body: unknown = request.method === "GET" ? null : await request.json().catch(() => null);
    return HttpResponse.json<Execution>(fn(found, body));
  };

export const executionHandlers = [
  http.get("*/api/v1/executions", () =>
    HttpResponse.json<ExecutionList>({ items: executionFixtures }),
  ),
  http.post("*/api/v1/executions", async ({ request }) => {
    const body = (await request.json()) as { projectId: string; prompt: string };
    return HttpResponse.json<Execution>({ ...base, ...body }, { status: 201 });
  }),
  http.get(
    "*/api/v1/executions/:id",
    withExecution((e) => e),
  ),
  http.get("*/api/v1/executions/:id/modes", () => HttpResponse.json({ items: modeFixtures })),
  http.put(
    "*/api/v1/executions/:id/mode",
    withExecution((e, b) => ({ ...e, ...(b as SetModeInput), status: "configuring" })),
  ),
  http.get("*/api/v1/executions/:id/questions", () =>
    HttpResponse.json({ items: questionFixtures }),
  ),
  http.put(
    "*/api/v1/executions/:id/config",
    withExecution((e, b) => ({ ...e, config: (b as { config: ExecutionConfig }).config })),
  ),
  http.post("*/api/v1/executions/:id/plan", async ({ request }) => {
    const body = (await request.json()) as GeneratePlanInput;
    if (body.modelAssisted && !body.consent) {
      return HttpResponse.json(consentRequired, { status: 428 });
    }
    return HttpResponse.json<ExecutionTasks>(planFixture);
  }),
  http.get("*/api/v1/executions/:id/tasks", () => HttpResponse.json<ExecutionTasks>(planFixture)),
  http.post(
    "*/api/v1/executions/:id/approve",
    withExecution((e, b) => ({
      ...e,
      status: "running",
      permissionBypass: (b as ApproveExecutionInput).permissionBypass,
    })),
  ),
  http.post(
    "*/api/v1/executions/:id/stop",
    withExecution((e) => ({ ...e, status: "cancelled" })),
  ),
  http.get("*/api/v1/executions/:id/verification", ({ params }) => {
    const v = byId(params.id)?.verification;
    if (!v) return HttpResponse.json(notFound, { status: 404 });
    return HttpResponse.json<Verification>(v);
  }),
];
