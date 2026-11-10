import {
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_TURN_TIMEOUT_MS,
  type ExecutionConfig,
  type ExecutionMode,
  MAX_PARALLEL_SESSIONS,
  type Question,
  type Strategy,
  type TaskAnalysis,
} from "@ubuliera/contracts";

import { clampParallel } from "./scheduler";
import { splitSubGoals } from "./subgoals";

export interface QuestionInput {
  mode: ExecutionMode;
  strategy: Strategy | null;
  analysis: TaskAnalysis | null;
  prompt: string;
  config: ExecutionConfig;
}

type Q = Omit<Question, "help" | "options" | "min" | "max"> &
  Partial<Pick<Question, "help" | "options" | "min" | "max">>;

const q = (v: Q): Question => ({ help: null, options: null, min: null, max: null, ...v });

/**
 * Only the follow-up questions relevant to this task and mode (FR-005), each with a
 * recommended default. Keys are ExecutionConfig fields or `answers.<name>`.
 */
export function buildQuestions(input: QuestionInput): Question[] {
  const goals = splitSubGoals(input.prompt).length;
  const complexity = input.analysis?.complexity ?? "medium";
  const out: Question[] = [];

  if (input.mode === "multi_session") {
    out.push(
      q({
        key: "parallelism",
        kind: "single",
        label: "Run independent tasks in parallel?",
        help: "Parallel tasks run in separate sessions; tasks touching the same files are serialised or isolated in their own worktree.",
        options: [
          {
            value: "parallel",
            label: "Parallel",
            description: "Faster; one session per ready task",
          },
          { value: "sequential", label: "Sequential", description: "One task at a time" },
        ],
        recommendedDefault: goals >= 2 ? "parallel" : "sequential",
      }),
      q({
        key: "maxParallelSessions",
        kind: "number",
        label: "Maximum sessions running at the same time",
        help: "Each session consumes model usage; at most 8.",
        recommendedDefault: clampParallel(Math.min(goals, 4)),
        min: 1,
        max: MAX_PARALLEL_SESSIONS,
      }),
    );
  }

  out.push(
    q({
      key: "approvalCheckpoints",
      kind: "boolean",
      label: "Ask before file edits (approval checkpoints)?",
      help: "On: sessions ask before editing. Off: edits inside the task's scope are accepted automatically. Risky tasks and shell commands always need approval.",
      recommendedDefault: true,
    }),
  );

  if ((input.analysis?.stack.testRunners.length ?? 0) > 0) {
    out.push(
      q({
        key: "runTestsOnVerify",
        kind: "boolean",
        label: `Run the project's tests (${input.analysis?.stack.testRunners.join(", ") ?? ""}) during verification?`,
        help: "Explicit opt-in. Not available yet: Ubuliera may only start claude, git and gh, so test results stay unavailable until a test runner is allowed.",
        recommendedDefault: false,
      }),
    );
  }

  if (complexity === "high" || complexity === "very_high") {
    out.push(
      q({
        key: "turnTimeoutMs",
        kind: "number",
        label: "Per-turn timeout (ms)",
        help: "A turn running longer is interrupted and its task fails with reason timeout.",
        recommendedDefault:
          complexity === "very_high" ? DEFAULT_TURN_TIMEOUT_MS * 2 : DEFAULT_TURN_TIMEOUT_MS,
        min: 60_000,
      }),
      q({
        key: "idleTimeoutMs",
        kind: "number",
        label: "Idle timeout (ms) before a session is marked unresponsive",
        recommendedDefault: DEFAULT_IDLE_TIMEOUT_MS,
        min: 10_000,
      }),
    );
  }

  if (input.strategy === "tdd") {
    out.push(
      q({
        key: "answers.testScope",
        kind: "text",
        label: "Which behaviour must the new tests cover?",
        recommendedDefault: "",
      }),
    );
  }
  if (input.strategy === "spec_driven") {
    out.push(
      q({
        key: "answers.acceptanceCriteria",
        kind: "text",
        label: "Acceptance criteria the result must meet",
        recommendedDefault: "",
      }),
    );
  }
  return out;
}
