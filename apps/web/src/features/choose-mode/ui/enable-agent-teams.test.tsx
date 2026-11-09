import { AGENT_TEAMS_ENABLE_CONFIRMATION } from "@nexora/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { ChooseModeForm } from "./choose-mode-form";
import { executionFixtures, modeFixtures } from "../../../../tests/msw/handlers";
import { server } from "../../../../tests/msw/server";
import { renderWithProviders } from "../../../../tests/render";

const execution = executionFixtures[0]!;

function captureEnable(changed = true) {
  const bodies: unknown[] = [];
  server.use(
    http.post("*/api/v1/runtime/agent-teams/enable", async ({ request }) => {
      const body = (await request.json()) as { projectId: string };
      bodies.push(body);
      return HttpResponse.json({
        projectId: body.projectId,
        settingsPath: "C:/work/nexora/.claude/settings.local.json",
        changed,
      });
    }),
  );
  return bodies;
}

async function renderEnable() {
  const utils = renderWithProviders(<ChooseModeForm execution={execution} onChosen={vi.fn()} />);
  const region = await screen.findByRole("region", { name: "Enable Agent Teams" });
  return { ...utils, region };
}

describe("ChooseModeForm — enable Agent Teams (FR-011)", () => {
  it("shows the exact enable instructions while Agent Teams are disabled", async () => {
    const { region } = await renderEnable();
    expect(region).toHaveTextContent('"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"');
    expect(region).toHaveTextContent(".claude/settings.local.json");
    expect(region).toHaveTextContent(/never simulates a team with subagents/i);
  });

  it("requires the exact confirmation phrase before enabling", async () => {
    const bodies = captureEnable();
    const { user, region } = await renderEnable();
    const button = within(region).getByRole("button", { name: "Enable for this project" });
    await user.click(button);
    expect(await within(region).findByRole("alert")).toHaveTextContent(
      `Type "${AGENT_TEAMS_ENABLE_CONFIRMATION}" exactly to confirm`,
    );
    await user.type(within(region).getByLabelText(/to confirm/i), "enable teams");
    await user.click(button);
    expect(within(region).getByRole("alert")).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  it("enables Agent Teams for the execution's project and refreshes the modes", async () => {
    const bodies = captureEnable();
    let modeRequests = 0;
    server.use(
      http.get("*/api/v1/executions/:id/modes", () => {
        modeRequests += 1;
        return HttpResponse.json({ items: modeFixtures });
      }),
    );
    const { user, region } = await renderEnable();
    expect(modeRequests).toBe(1);
    await user.type(within(region).getByLabelText(/to confirm/i), AGENT_TEAMS_ENABLE_CONFIRMATION);
    await user.click(within(region).getByRole("button", { name: "Enable for this project" }));
    expect(await within(region).findByRole("status")).toHaveTextContent(
      "Agent Teams enabled — written to C:/work/nexora/.claude/settings.local.json",
    );
    expect(bodies).toEqual([
      { projectId: execution.projectId, confirmation: AGENT_TEAMS_ENABLE_CONFIRMATION },
    ]);
    await waitFor(() => expect(modeRequests).toBe(2));
  });

  it("says so when the flag was already set", async () => {
    captureEnable(false);
    const { user, region } = await renderEnable();
    await user.type(within(region).getByLabelText(/to confirm/i), AGENT_TEAMS_ENABLE_CONFIRMATION);
    await user.click(within(region).getByRole("button", { name: "Enable for this project" }));
    expect(await within(region).findByRole("status")).toHaveTextContent(/already enabled/i);
  });

  it("shows a server refusal", async () => {
    server.use(
      http.post("*/api/v1/runtime/agent-teams/enable", () =>
        HttpResponse.json(
          { error: { code: "FORBIDDEN", message: "settings file is not writable" } },
          { status: 403 },
        ),
      ),
    );
    const { user, region } = await renderEnable();
    await user.type(within(region).getByLabelText(/to confirm/i), AGENT_TEAMS_ENABLE_CONFIRMATION);
    await user.click(within(region).getByRole("button", { name: "Enable for this project" }));
    expect(await within(region).findByRole("alert")).toHaveTextContent(/not writable/);
  });

  it("is not offered when Agent Teams are already available", async () => {
    server.use(
      http.get("*/api/v1/executions/:id/modes", () =>
        HttpResponse.json({
          items: modeFixtures.map((m) =>
            m.mode === "agent_teams"
              ? { ...m, available: true, unavailableReason: null, howToEnable: null }
              : m,
          ),
        }),
      ),
    );
    renderWithProviders(<ChooseModeForm execution={execution} onChosen={vi.fn()} />);
    await screen.findByRole("radio", { name: /agent teams/i });
    expect(screen.queryByRole("region", { name: "Enable Agent Teams" })).not.toBeInTheDocument();
  });
});
