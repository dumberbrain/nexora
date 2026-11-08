import { type ExecutionMode, type ExecutionStatus, type Strategy } from "./types";

export const EXECUTION_MODE_LABEL: Record<ExecutionMode, string> = {
  multi_session: "Multi-session",
  agent_teams: "Agent Teams",
  subagents: "Subagents",
  workflow: "Workflow",
  hybrid: "Hybrid",
};

export const STRATEGY_LABEL: Record<Strategy, string> = {
  spec_driven: "Spec-driven",
  plan_first: "Plan first",
  tdd: "Test-driven (TDD)",
  direct: "Direct",
  research_first: "Research first",
};

/** Statuses after approval — the wizard hands over to the execution view. */
const LAUNCHED: ReadonlySet<ExecutionStatus> = new Set([
  "running",
  "paused",
  "verifying",
  "completed",
  "failed",
  "cancelled",
]);

/** Statuses in which a stop request makes sense. */
const STOPPABLE: ReadonlySet<ExecutionStatus> = new Set(["running", "paused", "verifying"]);

export const isLaunched = (status: ExecutionStatus): boolean => LAUNCHED.has(status);
export const isStoppable = (status: ExecutionStatus): boolean => STOPPABLE.has(status);
