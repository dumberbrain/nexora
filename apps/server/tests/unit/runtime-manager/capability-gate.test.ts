import { CONTROL_KINDS, type ControlKind, type RuntimeCapabilityProfile } from "@nexora/contracts";
import { describe, expect, it } from "vitest";

import { AppError } from "../../../src/http/errors";
import {
  AGENT_SDK_CAPABILITIES,
  CLI_HEADLESS_CAPABILITIES,
} from "../../../src/modules/runtime-manager/capabilities";
import {
  assertAllSupport,
  assertControl,
  controlSupport,
} from "../../../src/modules/runtime-manager/capability-gate";
import { CapabilityUnsupportedError } from "../../../src/modules/runtime-manager/runtime-adapter";
import { EXTERNAL_OBSERVED_CAPABILITIES } from "../../../src/modules/session-manager/capabilities";

/** contracts/runtime-adapter.md → agent_team_pty column (no adapter yet). */
const AGENT_TEAM_PTY: RuntimeCapabilityProfile = {
  runtime: "agent_team_pty",
  canStart: true,
  canStop: true,
  canInterrupt: true,
  canPause: false,
  canResume: false,
  canRestart: false,
  canSendMessage: "lead_only",
  canSetPermissionMode: false,
  emitsEvents: [],
  reportsUsage: "none",
  notes: [],
};

/**
 * The capability matrix (contracts/runtime-adapter.md) applied to every control. `pause` is
 * "Interrupt & hold": interrupt + resume (no runtime pauses natively). Task controls are run by
 * the orchestrator, so they need a runtime Nexora can start.
 */
const MATRIX: Record<string, { profile: RuntimeCapabilityProfile; yes: ControlKind[] }> = {
  agent_sdk: { profile: AGENT_SDK_CAPABILITIES, yes: [...CONTROL_KINDS] },
  cli_headless: {
    profile: CLI_HEADLESS_CAPABILITIES,
    yes: [
      "stop",
      "resume",
      "send_message",
      "cancel_task",
      "retry_task",
      "request_review",
      "assign_task",
    ],
  },
  agent_team_pty: {
    profile: AGENT_TEAM_PTY,
    yes: [
      "stop",
      "interrupt",
      "send_message",
      "cancel_task",
      "retry_task",
      "request_review",
      "assign_task",
    ],
  },
  external_observed: { profile: EXTERNAL_OBSERVED_CAPABILITIES, yes: [] },
};

describe("capability gate", () => {
  for (const [kind, { profile, yes }] of Object.entries(MATRIX)) {
    for (const control of CONTROL_KINDS) {
      const expected = yes.includes(control);
      it(`${kind}: ${control} is ${expected ? "supported" : "unsupported"}`, () => {
        const s = controlSupport(profile, control);
        expect(s.supported).toBe(expected);
        expect(s.reason === null).toBe(expected);
        const managed = { observeOnly: false, capabilities: profile };
        if (expected) {
          expect(() => assertControl(managed, control)).not.toThrow();
        } else {
          let err: unknown;
          try {
            assertControl(managed, control);
          } catch (e) {
            err = e;
          }
          expect(err).toBeInstanceOf(CapabilityUnsupportedError);
          expect((err as CapabilityUnsupportedError).code).toBe("CAPABILITY_UNSUPPORTED");
          expect((err as CapabilityUnsupportedError).status).toBe(422);
          expect((err as CapabilityUnsupportedError).runtime).toBe(profile.runtime);
          expect((err as CapabilityUnsupportedError).capability).toBe(control);
        }
      });
    }
  }

  it("names the pause control 'Interrupt & hold' in its reason", () => {
    expect(controlSupport(CLI_HEADLESS_CAPABILITIES, "pause").reason).toMatch(/Interrupt & hold/);
  });

  it("a native pause capability also enables pause", () => {
    const native = { ...CLI_HEADLESS_CAPABILITIES, canPause: true };
    expect(controlSupport(native, "pause").supported).toBe(true);
  });

  it("lead_only messaging reaches the main agent but not other agents", () => {
    expect(controlSupport(AGENT_TEAM_PTY, "send_message", { target: "main" }).supported).toBe(true);
    const toAgent = controlSupport(AGENT_TEAM_PTY, "send_message", { target: "agent" });
    expect(toAgent.supported).toBe(false);
    expect(toAgent.reason).toMatch(/lead/i);
    expect(
      controlSupport(AGENT_SDK_CAPABILITIES, "send_message", { target: "agent" }).supported,
    ).toBe(true);
  });

  it("observed sessions are observe-only: every control is a CONFLICT (409), even when the profile allows it", () => {
    for (const control of CONTROL_KINDS) {
      let err: unknown;
      try {
        assertControl({ observeOnly: true, capabilities: AGENT_SDK_CAPABILITIES }, control);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("CONFLICT");
      expect((err as AppError).status).toBe(409);
    }
  });

  it("assertAllSupport passes only when every runtime of an execution supports the control", () => {
    expect(() => assertAllSupport([AGENT_SDK_CAPABILITIES], "pause")).not.toThrow();
    expect(() => assertAllSupport([], "pause")).not.toThrow();
    expect(() =>
      assertAllSupport([AGENT_SDK_CAPABILITIES, CLI_HEADLESS_CAPABILITIES], "pause"),
    ).toThrow(CapabilityUnsupportedError);
  });
});
