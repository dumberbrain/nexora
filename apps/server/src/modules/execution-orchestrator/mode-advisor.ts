import {
  type ExecutionMode,
  type ModeOption,
  type RuntimeEnvironment,
  type RuntimeKind,
  type TaskAnalysis,
} from "@nexora/contracts";

import { splitSubGoals } from "./subgoals";

/** Modes Nexora can actually execute today; the rest are shown unavailable with a reason. */
export const IMPLEMENTED_MODES: ReadonlySet<ExecutionMode> = new Set(["multi_session", "subagents"]);

export const AGENT_TEAMS_HOW_TO_ENABLE =
  'Set CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 in your environment or in the "env" block of ~/.claude/settings.json, then restart Nexora.';

const MODE_ORDER: ExecutionMode[] = [
  "multi_session",
  "subagents",
  "agent_teams",
  "workflow",
  "hybrid",
];

const NOT_YET: Partial<Record<ExecutionMode, string>> = {
  agent_teams: "Agent Teams execution arrives in US6; Nexora does not emulate teams with subagents.",
  workflow: "Workflow mode arrives in US5 (workflow builder and engine).",
  hybrid: "Hybrid mode arrives in US6 (combines teams, sessions, workflows, skills and MCP).",
};

const SESSION_RUNTIMES: RuntimeKind[] = ["agent_sdk", "cli_headless"];

export interface AdviseInput {
  analysis: TaskAnalysis;
  prompt: string;
  env: RuntimeEnvironment;
  implemented?: ReadonlySet<ExecutionMode>;
}

interface Availability {
  available: boolean;
  runtimes: RuntimeKind[];
  unavailableReason: string | null;
  howToEnable: string | null;
}

function availability(mode: ExecutionMode, input: AdviseInput): Availability {
  const { env } = input;
  const implemented = input.implemented ?? IMPLEMENTED_MODES;
  const no = (reason: string, howToEnable: string | null = null): Availability => ({
    available: false,
    runtimes: [],
    unavailableReason: reason,
    howToEnable,
  });
  if (!env.claude.installed) {
    return no(
      `Claude Code is not available: ${env.claude.reason ?? "not installed"}`,
      "Install Claude Code and make sure `claude` is on PATH.",
    );
  }
  if (mode === "agent_teams" && !env.agentTeams.enabled) {
    return no(
      `Agent Teams is not enabled (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS is not set: ${env.agentTeams.detail}).`,
      AGENT_TEAMS_HOW_TO_ENABLE,
    );
  }
  if (!implemented.has(mode)) return no(NOT_YET[mode] ?? `${mode} is not supported yet.`);
  const kinds: RuntimeKind[] = mode === "agent_teams" ? ["agent_team_pty"] : SESSION_RUNTIMES;
  const usable = env.runtimes.filter((r) => kinds.includes(r.kind));
  const runtimes = usable.filter((r) => r.available).map((r) => r.kind);
  if (runtimes.length === 0) {
    const reasons = usable.map((r) => `${r.kind}: ${r.reason ?? "unavailable"}`).join("; ");
    return no(`No runtime can run this mode (${reasons || "none detected"}).`);
  }
  return { available: true, runtimes, unavailableReason: null, howToEnable: null };
}

function preferred(goals: number, complexity: TaskAnalysis["complexity"]): ExecutionMode {
  return goals >= 2 && complexity !== "low" ? "multi_session" : "subagents";
}

function reasonFor(mode: ExecutionMode, goals: number, analysis: TaskAnalysis): string {
  const c = analysis.complexity.replace("_", " ");
  switch (mode) {
    case "multi_session":
      return goals >= 2
        ? `${goals} separate sub-goals at ${c} complexity can run as independent sessions in parallel, each in an isolated worktree. Suggested strategy: plan_first.`
        : `Only one goal was found, so parallel sessions add overhead without speed-up (${c} complexity).`;
    case "subagents":
      return goals >= 2
        ? `One primary session delegates ${goals} sub-goals to specialised agents and integrates the result; cheaper but sequential. Suggested strategy: plan_first.`
        : `A single focused goal (${c} complexity) fits one primary session that delegates to specialists and reviews the result. Suggested strategy: direct.`;
    case "agent_teams":
      return "Native Claude Code Agent Teams: a lead coordinates teammates with a shared task list.";
    case "workflow":
      return "Repeatable, versioned step graph with approvals and retries.";
    case "hybrid":
      return "Combines mechanisms per task and explains which one runs each task.";
  }
}

/** ModeOption per mode (US2-AS2): only usable modes are selectable; exactly one is recommended. */
export function adviseModes(input: AdviseInput): ModeOption[] {
  const goals = splitSubGoals(input.prompt).length;
  const options = MODE_ORDER.map((mode) => ({ mode, ...availability(mode, input) }));
  const want = preferred(goals, input.analysis.complexity);
  const recommended =
    options.find((o) => o.mode === want && o.available)?.mode ??
    options.find((o) => o.available)?.mode ??
    null;
  return options.map((o) => ({
    mode: o.mode,
    available: o.available,
    recommended: o.mode === recommended,
    reason: reasonFor(o.mode, goals, input.analysis),
    unavailableReason: o.unavailableReason,
    howToEnable: o.howToEnable,
    runtimes: o.runtimes,
  }));
}
