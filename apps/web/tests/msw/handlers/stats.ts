import { type Stats } from "@nexora/contracts";
import { http, HttpResponse } from "msw";

export const statsFixture: Stats = {
  activeSessions: 2,
  activeAgents: 3,
  idleAgents: 1,
  completedTasks: 12,
  failedTasks: 1,
  pendingApprovals: 0,
  runningWorkflows: 0,
  currentMode: null,
};

export const statsHandlers = [http.get("*/api/v1/stats", () => HttpResponse.json(statsFixture))];
