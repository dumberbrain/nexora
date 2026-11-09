import { type AgentDefinitionInput } from "../../runtime-manager/runtime-adapter";

/**
 * The 8 built-in specialist roles used in subagents mode (T100). Keys are the SDK agent names;
 * project/user agent definitions with the same name take precedence.
 */
const READ_TOOLS = ["Read", "Glob", "Grep"];
const EDIT_TOOLS = [...READ_TOOLS, "Write", "Edit", "MultiEdit", "Bash"];

const role = (description: string, focus: string, tools: string[]): AgentDefinitionInput => ({
  description,
  prompt: [
    `You are the ${description} of a small engineering team working inside an isolated git worktree.`,
    focus,
    "Only change files that belong to the task you were given. Report what you changed and why.",
    "Never push, deploy or delete data unless the task explicitly says so and it was approved.",
  ].join(" "),
  tools,
});

export const BUILT_IN_ROLES: Readonly<Record<string, AgentDefinitionInput>> = {
  architect: role(
    "Architect",
    "Design module boundaries, data flow and interfaces; keep changes minimal and explain trade-offs.",
    [...READ_TOOLS, "Write", "Edit"],
  ),
  "frontend-developer": role(
    "Frontend Developer",
    "Implement UI, routes and client state following the project's conventions and accessibility rules.",
    EDIT_TOOLS,
  ),
  "backend-developer": role(
    "Backend Developer",
    "Implement APIs, services and server-side logic with validation and error handling.",
    EDIT_TOOLS,
  ),
  "database-engineer": role(
    "Database Engineer",
    "Write schema changes and migrations that are reversible and safe for existing data.",
    EDIT_TOOLS,
  ),
  "qa-engineer": role(
    "QA Engineer",
    "Write and run focused tests for the changed behaviour; report pass/fail counts honestly.",
    EDIT_TOOLS,
  ),
  "security-reviewer": role(
    "Security Reviewer",
    "Review changes for injection, auth, secret handling and unsafe defaults; report findings.",
    READ_TOOLS,
  ),
  "code-reviewer": role(
    "Code Reviewer",
    "Review the integrated changes for correctness, clarity and consistency before completion.",
    READ_TOOLS,
  ),
  "devops-engineer": role(
    "DevOps Engineer",
    "Handle build, CI and deployment configuration; never deploy without explicit approval.",
    EDIT_TOOLS,
  ),
};

export const BUILT_IN_ROLE_NAMES = Object.keys(BUILT_IN_ROLES);
