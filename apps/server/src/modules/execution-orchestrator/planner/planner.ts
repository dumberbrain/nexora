import { type PlannedTask, PlannedTaskSchema, type RiskClass } from "@nexora/contracts";
import { z } from "zod";

import { AppError } from "../../../http/errors";
import { validateDag } from "../../task-manager/task-state";
import { extractJson } from "../json-output";
import { splitSubGoals } from "../subgoals";

/**
 * Planner (T091). The local planner turns the user's own sub-goals into one task each — it never
 * invents work. The model-backed planner (consent-gated, FR-008) returns JSON that is treated as
 * untrusted input: schema-validated, references repaired, DAG-checked.
 */

const MAX_TASKS = 50;
export const taskIdOf = (index: number) => `T-${index + 1}`;

const ROLE_RULES: [RegExp, string][] = [
  [
    /\b(migrations?|database|db|tables?|schema|sql|postgres(ql)?|sqlite|mysql|indexes)\b/i,
    "database-engineer",
  ],
  [/\b(tests?|e2e|specs?|coverage|qa|playwright|vitest|jest)\b/i, "qa-engineer"],
  [
    /\b(deploy(ment)?|ci|cd|pipeline|docker(file)?|kubernetes|k8s|infra(structure)?|release)\b/i,
    "devops-engineer",
  ],
  [
    /\b(security|vulnerabilit(y|ies)|auth(entication|orization)?|csrf|xss|secrets?)\b/i,
    "security-reviewer",
  ],
  [
    /\b(pages?|ui|components?|css|styles?|frontend|views?|screens?|forms?|layout)\b/i,
    "frontend-developer",
  ],
  [
    /\b(endpoints?|api|server|routes?|handlers?|backend|services?|controllers?)\b/i,
    "backend-developer",
  ],
  [/\b(architecture|architect|design the|module boundaries)\b/i, "architect"],
  [/\b(review|audit)\b/i, "code-reviewer"],
];

const RISK_RULES: [RegExp, RiskClass][] = [
  [
    /\b(drop|delete|truncate|wipe|purge|destroy|rm\s+-rf|force[- ]push|reset\s+--hard)\b/i,
    "destructive",
  ],
  [/\b(deploy|publish|production|prod)\b/i, "deploy"],
  [/\b(re-?architect|architecture)\b/i, "architecture"],
  [/\b(load[- ]test|backfill|re-?index (all|every)|bulk (import|export))\b/i, "expensive"],
];

const KNOWN_EXT =
  "ts|tsx|js|jsx|mjs|cjs|json|md|mdx|py|go|rs|java|kt|rb|php|cs|css|scss|html|vue|svelte|ya?ml|toml|sql|sh|prisma|graphql";
const PATH_TOKEN = new RegExp(
  `(?:^|[\\s(\`'"])((?:\\.{0,2}/)?[\\w@.-]+(?:/[\\w@.-]+)*/?|[\\w-]+\\.(?:${KNOWN_EXT}))(?=$|[\\s,;:)\`'"]|\\.(?:\\s|$))`,
  "g",
);
const FRAMEWORK_NAMES = /^(node|next|vue|nuxt|react|express|three|chart|d3|nest)\.js$/i;

/** Explicit file/dir paths written in the goal; directories become `dir/**`. */
export function pathsIn(goal: string): string[] {
  const out = new Set<string>();
  for (const m of goal.matchAll(PATH_TOKEN)) {
    const raw = (m[1] ?? "").replace(/^\.\//, "");
    if (!raw || raw.includes("://") || FRAMEWORK_NAMES.test(raw)) continue;
    const isDir = raw.endsWith("/");
    const looksLikePath = raw.includes("/") || new RegExp(`\\.(${KNOWN_EXT})$`).test(raw);
    if (!looksLikePath || raw === "/" || raw.startsWith("/")) continue;
    out.add(isDir ? `${raw}**` : raw);
  }
  return [...out];
}

const firstMatch = <T>(rules: [RegExp, T][], text: string): T | null =>
  rules.find(([re]) => re.test(text))?.[1] ?? null;

export function roleFor(goal: string): string | null {
  return firstMatch(ROLE_RULES, goal);
}

export function riskFor(goal: string): RiskClass {
  return firstMatch(RISK_RULES, goal) ?? "normal";
}

function titleOf(goal: string): string {
  const oneLine = goal.replace(/\s+/g, " ").trim();
  return oneLine.length > 200 ? `${oneLine.slice(0, 199)}…` : oneLine;
}

/** One task per explicit sub-goal; chained when the user chose sequential execution. */
export function heuristicPlan(input: { prompt: string; sequential: boolean }): PlannedTask[] {
  const goals = splitSubGoals(input.prompt).slice(0, MAX_TASKS);
  return goals.map((goal, i) => {
    const paths = pathsIn(goal);
    return {
      title: titleOf(goal) || `Task ${i + 1}`,
      description: goal.slice(0, 20_000),
      assignedAgentRole: roleFor(goal),
      dependsOn: input.sequential && i > 0 ? [taskIdOf(i - 1)] : [],
      priority: "p2",
      ownedPaths: paths.length > 0 ? paths : ["**"],
      riskClass: riskFor(goal),
      mechanismReason: null,
    };
  });
}

const PlanOutputSchema = z.object({
  tasks: z.array(PlannedTaskSchema).min(1).max(MAX_TASKS),
});

const invalid = (message: string) =>
  new AppError("VALIDATION_FAILED", `The model's plan was rejected: ${message}`);

/** Validate untrusted planner output; throws VALIDATION_FAILED when it cannot be used. */
export function parsePlanOutput(text: string): PlannedTask[] {
  const json = extractJson(text);
  if (json === undefined) throw invalid("no JSON object found");
  const parsed = PlanOutputSchema.safeParse(json);
  if (!parsed.success) {
    throw invalid(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  const ids = new Set(parsed.data.tasks.map((_, i) => taskIdOf(i)));
  const tasks = parsed.data.tasks.map((t, i) => ({
    ...t,
    dependsOn: [...new Set(t.dependsOn)].filter((d) => d !== taskIdOf(i) && ids.has(d)),
  }));
  try {
    validateDag(tasks.map((t, i) => ({ id: taskIdOf(i), dependsOn: t.dependsOn })));
  } catch (err) {
    throw invalid(err instanceof Error ? err.message : "invalid dependencies");
  }
  return tasks;
}

/** Read-only planning prompt for the model (permissionMode plan; Read/Glob/Grep only). */
export function planPrompt(input: {
  prompt: string;
  mode: string;
  roles: readonly string[];
  sequential: boolean;
}): string {
  return [
    "You are planning work for a team of Claude Code sessions. Do NOT modify anything.",
    "Inspect the repository read-only, then reply with ONLY a JSON object:",
    '{"tasks":[{"title":string(1-200),"description":string,"assignedAgentRole":string|null,',
    '"dependsOn":["T-<n>"],"priority":"p1"|"p2"|"p3","ownedPaths":[glob,...],',
    '"riskClass":"normal"|"destructive"|"expensive"|"deploy"|"architecture","mechanismReason":string|null}]}',
    "Task ids are T-1, T-2, … in array order. ownedPaths are globs relative to the repo root that",
    "the task may edit; keep them as narrow as possible. Mark anything that deletes data, deploys,",
    "costs significant money or changes the architecture with the matching riskClass.",
    `Execution mode: ${input.mode}. ${input.sequential ? "Tasks must run one after another." : "Independent tasks may run in parallel."}`,
    `Available roles: ${input.roles.join(", ")}.`,
    "",
    "User request:",
    input.prompt,
  ].join("\n");
}
