import { type RequestHandler } from "msw";

import { agentHandlers } from "./agents";
import { eventHandlers } from "./events";
import { projectHandlers } from "./projects";
import { sessionHandlers } from "./sessions";
import { statsHandlers } from "./stats";

export { agentFixtures } from "./agents";
export { eventFixtures, makeEvent } from "./events";
export { hookPreviewFixture, projectFixtures } from "./projects";
export { observedCapabilities, sessionFixtures } from "./sessions";
export { statsFixture } from "./stats";

/** Default handlers (US1 monitoring API); tests override per case with `server.use(...)`. */
export const handlers: RequestHandler[] = [
  ...projectHandlers,
  ...sessionHandlers,
  ...agentHandlers,
  ...eventHandlers,
  ...statsHandlers,
];
