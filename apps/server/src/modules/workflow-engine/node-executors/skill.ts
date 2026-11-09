import { SkillNodeConfigSchema } from "@nexora/contracts";

import { runSessionNode, type SessionNodeDeps } from "./session";
import { type NodeExecutor } from "../executor";

export interface SkillNodeDeps extends SessionNodeDeps {
  /** discovered skills/commands: name → executable (re-checked at run time) */
  skills(): Promise<ReadonlyMap<string, boolean>>;
}

/** The slash command that runs a skill: `/<skill> <args>` (the run prompt when args are empty). */
export function skillPrompt(skill: string, args: string, runPrompt: string): string {
  const a = args.trim() || runPrompt.trim();
  return a ? `/${skill} ${a}` : `/${skill}`;
}

/** `skill` node → managed session prompted with the skill's slash command (executable skills only). */
export function skillExecutor(deps: SkillNodeDeps): NodeExecutor {
  return async (ctx) => {
    const config = SkillNodeConfigSchema.parse(ctx.node.config);
    if ((await deps.skills()).get(config.skill) !== true) {
      throw new Error(`Skill "${config.skill}" is not an executable skill in this project`);
    }
    return runSessionNode(deps, ctx, {
      prompt: skillPrompt(config.skill, config.args, ctx.prompt),
    });
  };
}
