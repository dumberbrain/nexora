import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeAll, describe, expect, it } from "vitest";

import { agentFixtures, teamAgentFixtures } from "../../../../../tests/msw/handlers";
import { server } from "../../../../../tests/msw/server";
import { renderWithProviders } from "../../../../../tests/render";
import { teamGroups } from "../../lib/team-groups";
import { toFlow } from "../../lib/to-flow";
import { AgentCanvas } from "../agent-canvas";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const lead = teamAgentFixtures[0]!;

describe("teamGroups", () => {
  it("groups a team lead with its teammates and encloses their nodes", () => {
    const { nodes } = toFlow(teamAgentFixtures, new Set());
    const groups = teamGroups(teamAgentFixtures, nodes);
    expect(groups).toHaveLength(1);
    const [group] = groups;
    expect(group!.data.lead.id).toBe(lead.id);
    expect(group!.data.members.map((m) => m.name)).toEqual([
      "team-lead",
      "teammate-one",
      "teammate-two",
    ]);
    for (const n of nodes) {
      expect(n.position.x).toBeGreaterThanOrEqual(group!.position.x);
      expect(n.position.y).toBeGreaterThanOrEqual(group!.position.y);
    }
  });

  it("adds no group for sessions without a team", () => {
    const { nodes } = toFlow(agentFixtures, new Set());
    expect(teamGroups(agentFixtures, nodes)).toEqual([]);
  });
});

describe("TeamGroup on the canvas", () => {
  it("frames the team with the lead and each teammate's status", async () => {
    server.use(http.get("*/api/v1/agents", () => HttpResponse.json({ items: teamAgentFixtures })));
    renderWithProviders(<AgentCanvas />);
    // React Flow keeps nodes visibility:hidden until measured and jsdom never measures, so
    // accessible names compute empty here — query the labels (E2E checks the roles for real)
    const hidden = { hidden: true };
    const group = await screen.findByLabelText("Agent team led by team-lead");
    expect(group).toHaveAttribute("role", "group");
    expect(group).toHaveTextContent("3 members");
    const members = within(group).getByLabelText("Team members");
    const items = within(members).getAllByRole("listitem", hidden);
    expect(items.map((i) => i.textContent)).toEqual([
      "team-lead (lead): Running",
      "teammate-one: Running",
      "teammate-two: Idle",
    ]);
    // the agent nodes are still rendered and linked
    expect(screen.getByLabelText(/teammate-two \(teammate\) — open details/i)).toHaveAttribute(
      "href",
      "/agents/teammate-two",
    );
  });
});
