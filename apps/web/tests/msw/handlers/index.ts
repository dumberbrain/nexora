import { type RequestHandler } from "msw";

/** Default handlers; per-entity handler files (sessions, agents, events, …) are added per user story. */
export const handlers: RequestHandler[] = [];
