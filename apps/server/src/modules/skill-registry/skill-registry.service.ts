import { homedir } from "node:os";

import { type IntegrationItem } from "@ubuliera/contracts";

import { type DiscoveredItem, discoverSkills } from "./discovery";
import { redact } from "../../lib/redactor";
import { newId } from "../../lib/ulid";
import {
  decide,
  loadPermissionRules,
  type PermissionRules,
  type PermissionStatus,
} from "../mcp-registry/mcp-registry.service";

/**
 * Skill / command / agent-definition inventory (T146, FR-013/FR-014) on top of discovery.ts.
 * Agent prompts are never included (only description, tools and model).
 */

/** Claude Code tool names that gate each kind (`Skill(name)`, `SlashCommand(/name)`, `Task(name)`). */
function matcher(item: DiscoveredItem): (rule: string) => boolean {
  switch (item.kind) {
    case "skill":
      return (r) => r === "Skill" || r === `Skill(${item.name})` || r === `Skill(${item.name}:*)`;
    case "command":
      return (r) =>
        r === "SlashCommand" ||
        r === `SlashCommand(/${item.name})` ||
        r === `SlashCommand(/${item.name}:*)`;
    case "agent_definition":
      return (r) =>
        r === "Task" || r === "Agent" || r === `Task(${item.name})` || r === `Agent(${item.name})`;
  }
}

/**
 * Skills, commands and subagents run without a prompt unless a rule says otherwise, so an
 * unmatched item is `allowed` (deny > ask > allow still applies).
 */
export function itemPermission(rules: PermissionRules, item: DiscoveredItem): PermissionStatus {
  const status = decide(rules, matcher(item));
  const explicit = [...rules.deny, ...rules.ask, ...rules.allow].some(matcher(item));
  return explicit ? status : "allowed";
}

export interface SkillRegistryDeps {
  homeDir?: string;
  now?: () => number;
}

export class SkillRegistryService {
  private readonly homeDir: string;
  private readonly now: () => number;

  constructor(deps: SkillRegistryDeps = {}) {
    this.homeDir = deps.homeDir ?? homedir();
    this.now = deps.now ?? Date.now;
  }

  async inventory(input: {
    projectRoot: string | null;
    projectId?: string | null;
  }): Promise<IntegrationItem[]> {
    const roots = { projectRoot: input.projectRoot, homeDir: this.homeDir };
    const [items, rules] = await Promise.all([discoverSkills(roots), loadPermissionRules(roots)]);
    const now = this.now();
    return items.map((d) => {
      const metadata: Record<string, unknown> =
        d.kind === "agent_definition"
          ? { tools: d.definition?.tools ?? [], model: d.definition?.model ?? null }
          : {};
      const item: IntegrationItem = {
        id: newId(now),
        projectId: d.scope === "project" ? (input.projectId ?? null) : null,
        kind: d.kind,
        name: d.name,
        scope: d.scope,
        sourcePath: d.sourcePath,
        executable: d.executable,
        // discovered and parsed from disk: nothing to reach
        health: "ok",
        permissionStatus: itemPermission(rules, d),
        metadata,
        discoveredAt: now,
        description: d.description ? d.description.slice(0, 2000) : null,
        tools: [],
        healthDetail: null,
        checkedAt: now,
      };
      return redact(item) as IntegrationItem;
    });
  }
}
