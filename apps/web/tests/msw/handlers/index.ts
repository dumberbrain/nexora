import { type RequestHandler } from "msw";

import { agentHandlers } from "./agents";
import { approvalHandlers } from "./approvals";
import { eventHandlers } from "./events";
import { executionHandlers } from "./executions";
import { githubHandlers } from "./github";
import { integrationHandlers } from "./integrations";
import { messageHandlers } from "./messages";
import { projectHandlers } from "./projects";
import { runtimeHandlers } from "./runtime";
import { sessionHandlers } from "./sessions";
import { statsHandlers } from "./stats";
import { taskHandlers } from "./tasks";
import { teamHandlers } from "./teams";
import { workflowHandlers } from "./workflows";

export { agentFixtures } from "./agents";
export { approvalFixtures } from "./approvals";
export { eventFixtures, makeEvent } from "./events";
export {
  defaultConfig,
  executionFixtures,
  modeFixtures,
  planFixture,
  questionFixtures,
  verificationFixture,
} from "./executions";
export {
  githubBranchFixtures,
  githubCommitFixtures,
  githubPullFilesFixture,
  githubPullFixtures,
  githubRepoFixtures,
  githubStatusFixtures,
} from "./github";
export {
  INTEGRATIONS_DISCOVERED_AT,
  integrationFixtures,
  refreshedIntegrationFixtures,
} from "./integrations";
export { messageFixtures } from "./messages";
export { hookPreviewFixture, projectFixtures } from "./projects";
export { runtimeEnvironmentFixture } from "./runtime";
export {
  managedCapabilities,
  managedSessionFixture,
  observedCapabilities,
  sessionFixtures,
} from "./sessions";
export { statsFixture } from "./stats";
export { boardFixtures, resetTaskBoard } from "./tasks";
export {
  enableResultFixture,
  hybridPlanFixture,
  TEAM_LEAD_SESSION_ID,
  teamAgentFixtures,
  teamLeadDetailFixture,
  teamLeadSessionFixture,
  teamPtyCapabilities,
  teamViewFixture,
} from "./teams";
export {
  resetWorkflows,
  validateGraphFixture,
  WORKFLOW_EXECUTION_ID,
  workflowFixtures,
  workflowGraphFixture,
  workflowRunFixture,
} from "./workflows";

/** Default handlers (US1 monitoring + US2 orchestration + US3 controls + US4 board + US5 workflows + US6 teams + US7 integrations/GitHub); tests override per case with `server.use(...)`. */
export const handlers: RequestHandler[] = [
  ...projectHandlers,
  ...sessionHandlers,
  ...agentHandlers,
  ...eventHandlers,
  ...statsHandlers,
  ...executionHandlers,
  ...approvalHandlers,
  ...messageHandlers,
  ...runtimeHandlers,
  ...taskHandlers,
  ...workflowHandlers,
  ...integrationHandlers,
  ...githubHandlers,
  ...teamHandlers,
];
