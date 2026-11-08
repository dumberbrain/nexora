import {
  AGENT_STATUSES,
  EXECUTION_STATUSES,
  SESSION_STATUSES,
  TASK_STATUSES,
} from "@nexora/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "./status-badge";
import { STATUS_LABEL, type StatusKind, toStatusKind } from "../model/status-kind";

describe("toStatusKind", () => {
  it("maps every session, agent, task and execution status", () => {
    const all = [
      ...SESSION_STATUSES.values,
      ...AGENT_STATUSES.values,
      ...TASK_STATUSES.values,
      ...EXECUTION_STATUSES.values,
    ];
    for (const s of all) expect(STATUS_LABEL[toStatusKind(s)]).toBeTruthy();
  });

  it("keeps the five control states distinct (FR-032)", () => {
    const kinds = new Set(
      (["paused", "waiting_for_approval", "idle", "running", "stopped"] as const).map(toStatusKind),
    );
    expect(kinds.size).toBe(5);
  });
});

describe("StatusBadge", () => {
  it.each(Object.keys(STATUS_LABEL) as StatusKind[])("renders a text label for %s", (kind) => {
    render(<StatusBadge kind={kind} />);
    expect(screen.getByText(STATUS_LABEL[kind])).toBeInTheDocument();
  });

  it("allows a custom label", () => {
    render(<StatusBadge kind="waiting" label="waiting_for_input" />);
    expect(screen.getByText("waiting_for_input")).toBeInTheDocument();
  });
});
