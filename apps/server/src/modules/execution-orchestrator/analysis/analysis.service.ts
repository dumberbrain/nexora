import { COMPLEXITIES, type TaskAnalysis } from "@nexora/contracts";
import { z } from "zod";

import { discoverMcpServers } from "../../mcp-registry/discovery";
import { detectInstructionFiles, detectStack } from "../../project-registry/stack-detector";
import { type ManagedRuntime } from "../../runtime-manager/runtime-adapter";
import { discoverSkills } from "../../skill-registry/discovery";
import { extractJson } from "../json-output";
import { splitSubGoals } from "../subgoals";

/**
 * Task analysis (T089). The default is purely local — manifests/lockfiles, instruction files,
 * discovered skills/agents/MCP servers and a heuristic complexity — and never spends model usage.
 * The optional model-backed refinement runs a read-only query and is only called by the
 * orchestrator after consent (FR-008); its output is validated and otherwise ignored.
 */
export type Complexity = TaskAnalysis["complexity"];

export function heuristicComplexity(prompt: string): Complexity {
  const goals = splitSubGoals(prompt).length;
  const chars = prompt.trim().length;
  if (goals >= 7 || chars > 4000) return "very_high";
  if (goals >= 4 || chars > 1500) return "high";
  if (goals >= 2 || chars > 300) return "medium";
  return "low";
}

const RefinementSchema = z.object({
  complexity: z.enum(COMPLEXITIES),
  summary: z.string().trim().min(1).max(4000),
});

export interface AnalysisDeps {
  runtime: Pick<ManagedRuntime, "readOnlyQuery">;
  homeDir: string;
}

export class AnalysisService {
  constructor(private readonly deps: AnalysisDeps) {}

  async analyzeLocally(projectRoot: string, prompt: string): Promise<TaskAnalysis> {
    const roots = { projectRoot, homeDir: this.deps.homeDir };
    const [stack, instructionFiles, items, mcp] = await Promise.all([
      detectStack(projectRoot),
      detectInstructionFiles(projectRoot),
      discoverSkills(roots),
      discoverMcpServers(roots),
    ]);
    const uniq = (xs: string[]) => [...new Set(xs)];
    const skills = uniq(items.filter((i) => i.kind !== "agent_definition").map((i) => i.name));
    const agents = uniq(items.filter((i) => i.kind === "agent_definition").map((i) => i.name));
    const complexity = heuristicComplexity(prompt);
    const goals = splitSubGoals(prompt).length;
    const stackText = [...stack.languages, ...stack.frameworks].join(", ") || "no known stack";
    return {
      stack,
      instructionFiles,
      skills,
      agents,
      mcpServers: uniq(mcp.map((s) => s.name)),
      complexity,
      summary:
        `Local analysis (no model used): ${goals} sub-goal${goals === 1 ? "" : "s"}, ` +
        `${complexity.replace("_", " ")} complexity; stack: ${stackText}; ` +
        `${instructionFiles.length} instruction file(s), ${skills.length} skill(s)/command(s), ` +
        `${agents.length} project/user agent(s), ${mcp.length} MCP server(s).`,
      modelAssisted: false,
    };
  }

  /**
   * Model-backed refinement — CALLER MUST HAVE CONSENT. Returns null when the model output is
   * not a valid `{ complexity, summary }` object (never trusted blindly).
   */
  async refineWithModel(
    projectRoot: string,
    prompt: string,
    local: TaskAnalysis,
  ): Promise<TaskAnalysis | null> {
    const { text } = await this.deps.runtime.readOnlyQuery({
      cwd: projectRoot,
      maxTurns: 8,
      prompt: [
        "Analyse this software task against the repository. Do NOT modify anything.",
        'Reply with ONLY a JSON object: {"complexity":"low"|"medium"|"high"|"very_high","summary":string}.',
        "The summary (max 4000 chars) explains which parts of the codebase are affected and the main risks.",
        `Locally detected: ${local.summary}`,
        "",
        "Task:",
        prompt,
      ].join("\n"),
    });
    const parsed = RefinementSchema.safeParse(extractJson(text));
    if (!parsed.success) return null;
    return { ...local, ...parsed.data, modelAssisted: true };
  }
}
