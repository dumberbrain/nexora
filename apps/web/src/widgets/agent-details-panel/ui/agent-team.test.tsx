import { type AgentDetail, type Session } from "@nexora/contracts";
import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { AgentDetailsPanel } from "./agent-details-panel";
import {
  agentFixtures,
  teamAgentFixtures,
  teamLeadDetailFixture,
  teamLeadSessionFixture,
  teamViewFixture,
} from "../../../../tests/msw/handlers";
import { server } from "../../../../tests/msw/server";
import { renderWithProviders } from "../../../../tests/render";

const lead = teamAgentFixtures[0]!;
const teammateOne = teamAgentFixtures[1]!;

function serveDetail(detail: AgentDetail) {
  server.use(http.get("*/api/v1/agents/:id", () => HttpResponse.json(detail)));
}

const stubTerminal = (session: Session) => (
  <div data-terminal>
    terminal of {session.id}
    <textarea aria-label="Terminal input" />
  </div>
);

function renderPanel(agentId: string) {
  return renderWithProviders(
    <AgentDetailsPanel
      agentId={agentId}
      open
      onOpenChange={() => {}}
      leadTerminal={stubTerminal}
    />,
  );
}

describe("AgentDetailsPanel — Agent Teams (US6)", () => {
  it("lists the team's tasks and teammate statuses, labelled best effort", async () => {
    serveDetail(teamLeadDetailFixture);
    renderPanel(lead.id);
    const team = await screen.findByRole("region", { name: /agent team/i });
    expect(await within(team).findByText("best effort")).toBeInTheDocument();
    expect(team).toHaveTextContent("session-9da5d295");

    const members = within(team).getByRole("list", { name: "Teammate statuses" });
    const rows = within(members)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(rows).toEqual([
      expect.stringMatching(/team-lead.*lead.*active/),
      expect.stringMatching(/teammate-one.*general-purpose.*active/),
      expect.stringMatching(/teammate-two.*general-purpose.*idle/),
    ]);

    const tasks = within(team).getByRole("table", { name: "Team tasks" });
    expect(within(tasks).getAllByRole("row")).toHaveLength(3);
    expect(tasks).toHaveTextContent("Write hello.txt");
    expect(tasks).toHaveTextContent("in_progress");
    expect(tasks).toHaveTextContent("teammate-one");
    expect(team).toHaveTextContent("teammate-two is idle");
  });

  it("shows the team for a teammate too, but no terminal", async () => {
    serveDetail({ ...teamLeadDetailFixture, agent: teammateOne, children: [] });
    renderPanel(teammateOne.id);
    const team = await screen.findByRole("region", { name: /agent team/i });
    expect(await within(team).findByText("Write bye.txt")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /lead terminal/i })).not.toBeInTheDocument();
  });

  it("says when the team has no shared tasks yet", async () => {
    serveDetail(teamLeadDetailFixture);
    server.use(
      http.get("*/api/v1/sessions/:id/team", () =>
        HttpResponse.json({ ...teamViewFixture, tasks: [] }),
      ),
    );
    renderPanel(lead.id);
    const team = await screen.findByRole("region", { name: /agent team/i });
    expect(await within(team).findByText(/no shared tasks/i)).toBeInTheDocument();
  });

  it("explains a session without a team yet", async () => {
    serveDetail(teamLeadDetailFixture);
    server.use(
      http.get("*/api/v1/sessions/:id/team", () =>
        HttpResponse.json(
          { error: { code: "NOT_FOUND", message: "no team for this session" } },
          { status: 404 },
        ),
      ),
    );
    renderPanel(lead.id);
    const team = await screen.findByRole("region", { name: /agent team/i });
    expect(await within(team).findByText(/no team has been created yet/i)).toBeInTheDocument();
  });

  it("embeds the lead terminal for a Nexora-started team lead", async () => {
    serveDetail(teamLeadDetailFixture);
    renderPanel(lead.id);
    const section = await screen.findByRole("region", { name: /lead terminal/i });
    expect(section).toHaveTextContent(`terminal of ${teamLeadSessionFixture.id}`);
  });

  it("lets Esc reach the terminal instead of closing the panel", async () => {
    serveDetail(teamLeadDetailFixture);
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(
      <AgentDetailsPanel
        agentId={lead.id}
        open
        onOpenChange={onOpenChange}
        leadTerminal={stubTerminal}
      />,
    );
    await user.click(await screen.findByLabelText("Terminal input"));
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("heading", { name: "team-lead" }));
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("offers no terminal for an observe-only lead", async () => {
    serveDetail({
      ...teamLeadDetailFixture,
      session: { ...teamLeadSessionFixture, observeOnly: true },
    });
    renderPanel(lead.id);
    await screen.findByRole("region", { name: /agent team/i });
    expect(screen.queryByRole("region", { name: /lead terminal/i })).not.toBeInTheDocument();
  });

  it("shows no team section for an ordinary subagent", async () => {
    renderPanel(agentFixtures[1]!.id);
    await screen.findByRole("region", { name: /controls/i });
    expect(screen.queryByRole("region", { name: /agent team/i })).not.toBeInTheDocument();
  });
});
