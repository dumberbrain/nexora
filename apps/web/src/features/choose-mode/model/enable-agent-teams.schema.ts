import { AGENT_TEAMS_ENABLE_CONFIRMATION } from "@ubuliera/contracts";
import { z } from "zod";

/** FR-011: enabling Agent Teams needs the exact phrase typed — no checkbox, no default. */
export const EnableAgentTeamsFormSchema = z.object({
  confirmation: z.string().refine((v) => v === AGENT_TEAMS_ENABLE_CONFIRMATION, {
    error: `Type "${AGENT_TEAMS_ENABLE_CONFIRMATION}" exactly to confirm`,
  }),
});
/** what the input holds (any text) vs. what passes validation (the exact phrase) */
export type EnableAgentTeamsFormInput = z.input<typeof EnableAgentTeamsFormSchema>;
export type EnableAgentTeamsFormValues = z.output<typeof EnableAgentTeamsFormSchema>;

/** Settings file the server writes, relative to the project root. */
export const AGENT_TEAMS_SETTINGS_FILE = ".claude/settings.local.json";

/** The exact JSON the enable action merges into that file. */
export const AGENT_TEAMS_SETTINGS_SNIPPET =
  '{ "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }';
