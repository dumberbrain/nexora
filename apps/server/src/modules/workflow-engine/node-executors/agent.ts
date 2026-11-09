import { AgentNodeConfigSchema } from "@nexora/contracts";

import { runSessionNode, type SessionNodeDeps, stepContext } from "./session";
import { BUILT_IN_ROLES } from "../../execution-orchestrator/agents/roles";
import { type AgentDefinitionInput } from "../../runtime-manager/runtime-adapter";
import { type NodeExecutor } from "../executor";

export interface AgentNodeDeps extends SessionNodeDeps {
  /** discovered project/user agent definitions by name (they take precedence over built-ins) */
  agentDefinitions(): Promise<ReadonlyMap<string, AgentDefinitionInput>>;
}

/** `agent` node → one managed session in the execution worktree, acting as the configured role. */
export function agentExecutor(deps: AgentNodeDeps): NodeExecutor {
  return async (ctx) => {
    const config = AgentNodeConfigSchema.parse(ctx.node.config);
    const discovered = (await deps.agentDefinitions()).get(config.role);
    const builtIn = Object.hasOwn(BUILT_IN_ROLES, config.role)
      ? BUILT_IN_ROLES[config.role]
      : undefined;
    const preamble = discovered
      ? `Delegate this step to the "${config.role}" subagent and report its result.`
      : builtIn
        ? builtIn.prompt
        : `Act as the ${config.role} for this step.`;
    return runSessionNode(deps, ctx, {
      prompt: [preamble, ...stepContext(ctx), `Your step: ${config.prompt}`].join("\n\n"),
      ownedPaths: config.ownedPaths,
      ...(discovered ? { agents: { [config.role]: discovered } } : {}),
    });
  };
}
