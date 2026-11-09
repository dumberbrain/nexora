import { type RuntimeEnvironment } from "@nexora/contracts";
import { http, HttpResponse } from "msw";

import { observedCapabilities } from "./sessions";

export const runtimeEnvironmentFixture: RuntimeEnvironment = {
  claude: { installed: true, version: "2.1.319", authenticated: null, reason: null },
  agentTeams: {
    enabled: false,
    detail: "Set CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 to enable Agent Teams",
  },
  runtimes: [
    {
      kind: "agent_sdk",
      available: true,
      reason: null,
      capabilities: { ...observedCapabilities, runtime: "agent_sdk", canStop: true },
    },
  ],
};

export const runtimeHandlers = [
  http.get("*/api/v1/runtime/environment", () =>
    HttpResponse.json<RuntimeEnvironment>(runtimeEnvironmentFixture),
  ),
];
