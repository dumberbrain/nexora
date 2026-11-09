import { RuntimeEnvironmentSchema, type RuntimeEnvironment } from "@nexora/contracts";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { type AppBindings } from "../../../src/http/context";
import { errorMapper } from "../../../src/http/middleware/error-mapper";
import { registerRuntimeRoutes } from "../../../src/http/routes/runtime";
import { createLogger } from "../../../src/lib/logger";
import { AGENT_SDK_CAPABILITIES } from "../../../src/modules/runtime-manager/capabilities";
import { CapabilityUnsupportedError } from "../../../src/modules/runtime-manager/errors";

const env: RuntimeEnvironment = {
  claude: { installed: true, version: "2.1.3", authenticated: null, reason: null },
  agentTeams: { enabled: false, detail: "Set CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1" },
  runtimes: [
    { kind: "agent_sdk", available: true, reason: null, capabilities: AGENT_SDK_CAPABILITIES },
  ],
};

function app() {
  const api = new Hono<AppBindings>();
  api.onError(errorMapper(createLogger({ level: "silent" })));
  registerRuntimeRoutes(api, { runtime: { environment: () => Promise.resolve(env) } });
  api.get("/boom", () => {
    throw new CapabilityUnsupportedError("cli_headless", "interrupt");
  });
  return api;
}

describe("GET /runtime/environment", () => {
  it("returns the detected environment in the contract shape", async () => {
    const res = await app().request("/runtime/environment");
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(RuntimeEnvironmentSchema.parse(body)).toEqual(env);
  });
});

describe("CapabilityUnsupportedError mapping", () => {
  it("maps to 422 CAPABILITY_UNSUPPORTED with runtime and capability details", async () => {
    const res = await app().request("/boom");
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: {
        code: "CAPABILITY_UNSUPPORTED",
        message: "cli_headless does not support interrupt",
        details: [{ runtime: "cli_headless", capability: "interrupt" }],
      },
    });
  });
});
