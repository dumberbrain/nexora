import { type RequestHandler } from "msw";

import { agentHandlers } from "./agents";
import { approvalHandlers } from "./approvals";
import { eventHandlers } from "./events";
import { executionHandlers } from "./executions";
import { projectHandlers } from "./projects";
import { runtimeHandlers } from "./runtime";
import { sessionHandlers } from "./sessions";
import { statsHandlers } from "./stats";

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
export { hookPreviewFixture, projectFixtures } from "./projects";
export { runtimeEnvironmentFixture } from "./runtime";
export { observedCapabilities, sessionFixtures } from "./sessions";
export { statsFixture } from "./stats";

/** Default handlers (US1 monitoring + US2 orchestration API); tests override per case with `server.use(...)`. */
export const handlers: RequestHandler[] = [
  ...projectHandlers,
  ...sessionHandlers,
  ...agentHandlers,
  ...eventHandlers,
  ...statsHandlers,
  ...executionHandlers,
  ...approvalHandlers,
  ...runtimeHandlers,
];
