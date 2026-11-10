import { screen, within } from "@testing-library/react";
import { type AgentDetail } from "@ubuliera/contracts";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { AgentDetailsPanel } from "./agent-details-panel";
import {
  agentFixtures,
  managedSessionFixture,
  sessionFixtures,
} from "../../../../tests/msw/handlers";
import { server } from "../../../../tests/msw/server";
import { renderWithProviders } from "../../../../tests/render";

const reviewer = agentFixtures[1]!;

function renderPanel(agentId = reviewer.id) {
  return renderWithProviders(<AgentDetailsPanel agentId={agentId} open onOpenChange={() => {}} />);
}

describe("AgentDetailsPanel", () => {
  it("shows identity, assignment, parent and derived files", async () => {
    renderPanel();
    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByRole("heading", { name: "code-reviewer" }),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Reviews diffs for correctness");
    expect(dialog).toHaveTextContent("T-4");
    expect(within(dialog).getByRole("link", { name: reviewer.parentAgentId! })).toHaveAttribute(
      "href",
      `/agents/${reviewer.parentAgentId}`,
    );
    expect(dialog).toHaveTextContent("apps/web/src/widgets/session-table/index.ts");
  });

  it("marks token usage as unavailable when the runtime does not report it", async () => {
    renderPanel();
    const usage = await screen.findByRole("region", { name: /token usage & cost/i });
    expect(
      within(usage).getByRole("button", { name: /not available/ }),
    ).toHaveAccessibleDescription("runtime does not report usage");
    expect(usage).not.toHaveTextContent(/\$0/);
  });

  it("shows reported usage and flags a runtime cost estimate", async () => {
    const detail: AgentDetail = {
      agent: reviewer,
      session: sessionFixtures[2]!,
      children: [],
      filesChanged: [],
    };
    server.use(http.get("*/api/v1/agents/:id", () => HttpResponse.json(detail)));
    renderPanel();
    const usage = await screen.findByRole("region", { name: /token usage & cost/i });
    expect(usage).toHaveTextContent("18,204");
    expect(usage).toHaveTextContent("$0.42");
    expect(usage).toHaveTextContent("(runtime estimate)");
  });

  it("shows the session controls disabled for an observe-only agent", async () => {
    renderPanel();
    const controls = await screen.findByRole("region", { name: /controls/i });
    const pause = await within(controls).findByRole("button", { name: "Interrupt & hold" });
    expect(pause).toHaveAttribute("aria-disabled", "true");
    expect(pause).toHaveAccessibleDescription(/observe-only/i);
    expect(within(controls).getByRole("button", { name: "Send message" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("offers live controls and messaging for an agent of a Ubuliera-managed session", async () => {
    const detail: AgentDetail = {
      agent: { ...reviewer, sessionId: managedSessionFixture.id },
      session: managedSessionFixture,
      children: [],
      filesChanged: [],
    };
    server.use(http.get("*/api/v1/agents/:id", () => HttpResponse.json(detail)));
    renderPanel();
    const controls = await screen.findByRole("region", { name: /controls/i });
    expect(await within(controls).findByRole("button", { name: "Stop" })).not.toHaveAttribute(
      "aria-disabled",
    );
    expect(within(controls).getByLabelText(/message to code-reviewer/i)).toBeEnabled();
  });

  it("lists the agent's events with source and reliability tags", async () => {
    renderPanel();
    const timeline = await screen.findByRole("list", { name: "Agent activity" });
    expect(
      within(timeline).getByText("Edited apps/web/src/widgets/session-table/index.ts"),
    ).toBeInTheDocument();
    expect(within(timeline).getByText(/^derived/)).toBeInTheDocument();
    expect(within(timeline).getAllByText(/^authoritative/).length).toBeGreaterThan(0);
    expect(within(timeline).queryByText("Bash: npm test")).not.toBeInTheDocument();
  });
});
