import { PAUSE_CONTROL_LABEL, type Session } from "@ubuliera/contracts";
import { describe, expect, it } from "vitest";

import { deriveExecutionControls, deriveSessionControls } from "./derive-controls";
import {
  managedCapabilities,
  managedSessionFixture,
  sessionFixtures,
} from "../../../../tests/msw/handlers";

const managed = (p: Partial<Session> = {}): Session => ({ ...managedSessionFixture, ...p });
const byKind = (controls: ReturnType<typeof deriveSessionControls>) =>
  Object.fromEntries(controls.map((c) => [c.kind, c]));

const ptyCaps = {
  ...managedCapabilities,
  runtime: "agent_team_pty" as const,
  canResume: false,
  canRestart: false,
};

describe("deriveSessionControls", () => {
  it("offers stop, interrupt & hold, resume and restart with the FR-031 label", () => {
    const controls = deriveSessionControls(managed());
    expect(controls.map((c) => c.label)).toEqual([
      "Stop",
      PAUSE_CONTROL_LABEL,
      "Resume",
      "Restart",
    ]);
  });

  it("disables everything on an observe-only session with the reason", () => {
    for (const c of deriveSessionControls(sessionFixtures[0]!)) {
      expect(c.enabled).toBe(false);
      expect(c.reason).toMatch(/observe-only/i);
    }
  });

  it("derives availability from capabilities first, then status", () => {
    const running = byKind(deriveSessionControls(managed()));
    expect(running.stop?.enabled).toBe(true);
    expect(running.pause?.enabled).toBe(true);
    expect(running.resume?.enabled).toBe(false);
    expect(running.resume?.reason).toMatch(/running/);
    expect(running.restart?.enabled).toBe(false);

    const paused = byKind(deriveSessionControls(managed({ status: "paused" })));
    expect(paused.resume?.enabled).toBe(true);
    expect(paused.pause?.enabled).toBe(false);

    const stopped = byKind(deriveSessionControls(managed({ status: "stopped" })));
    expect(stopped.stop?.enabled).toBe(false);
    expect(stopped.restart?.enabled).toBe(true);
  });

  it("explains a runtime that cannot interrupt and resume", () => {
    const pty = byKind(deriveSessionControls(managed({ capabilities: ptyCaps })));
    expect(pty.pause).toMatchObject({ enabled: false });
    expect(pty.pause?.reason).toMatch(/Agent Teams \(PTY\).*cannot resume/);
    expect(pty.restart?.reason).toMatch(/cannot restart/);
  });
});

describe("deriveExecutionControls", () => {
  const kinds = (c: ReturnType<typeof deriveExecutionControls>) =>
    Object.fromEntries(c.map((x) => [x.kind, x]));

  it("offers stop, interrupt & hold and resume", () => {
    expect(deriveExecutionControls("running", [managed()]).map((c) => c.label)).toEqual([
      "Stop",
      PAUSE_CONTROL_LABEL,
      "Resume",
    ]);
  });

  it("enables pause only when every runtime can interrupt and resume", () => {
    expect(kinds(deriveExecutionControls("running", [managed()])).pause?.enabled).toBe(true);
    const mixed = kinds(
      deriveExecutionControls("running", [managed(), managed({ capabilities: ptyCaps })]),
    );
    expect(mixed.pause?.enabled).toBe(false);
    expect(mixed.pause?.reason).toMatch(/Agent Teams \(PTY\)/);
  });

  it("needs a runtime session before interrupting", () => {
    const none = kinds(deriveExecutionControls("running", []));
    expect(none.pause).toMatchObject({ enabled: false });
    expect(none.pause?.reason).toMatch(/no runtime session/i);
    expect(none.stop?.enabled).toBe(true);
  });

  it("follows the execution status", () => {
    const paused = kinds(deriveExecutionControls("paused", [managed({ status: "paused" })]));
    expect(paused.resume?.enabled).toBe(true);
    expect(paused.pause?.enabled).toBe(false);
    const done = kinds(deriveExecutionControls("completed", [managed({ status: "stopped" })]));
    expect(Object.values(done).every((c) => !c.enabled)).toBe(true);
  });
});
