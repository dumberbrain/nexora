import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { ChooseModeForm } from "./choose-mode-form";
import { executionFixtures } from "../../../../tests/msw/handlers";
import { server } from "../../../../tests/msw/server";
import { renderWithProviders } from "../../../../tests/render";

const execution = executionFixtures[0]!;

describe("ChooseModeForm", () => {
  it("preselects the recommended mode and shows why it is recommended", async () => {
    renderWithProviders(<ChooseModeForm execution={execution} onChosen={vi.fn()} />);
    const recommended = await screen.findByRole("radio", { name: /multi-session/i });
    expect(recommended).toBeChecked();
    expect(screen.getByText("recommended")).toBeInTheDocument();
    expect(recommended).toHaveAccessibleDescription(/independent ui and store changes/i);
  });

  it("disables unavailable modes and explains why and how to enable them", async () => {
    renderWithProviders(<ChooseModeForm execution={execution} onChosen={vi.fn()} />);
    const teams = await screen.findByRole("radio", { name: /agent teams/i });
    expect(teams).toBeDisabled();
    expect(teams).toHaveAccessibleDescription(/agent teams are disabled in this environment/i);
    expect(screen.getByText(/CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1/)).toBeInTheDocument();
  });

  it("puts the chosen mode and strategy", async () => {
    let body: unknown;
    server.use(
      http.put("*/api/v1/executions/:id/mode", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ...execution, status: "configuring" });
      }),
    );
    const onChosen = vi.fn();
    const { user } = renderWithProviders(
      <ChooseModeForm execution={execution} onChosen={onChosen} />,
    );
    await user.click(await screen.findByRole("radio", { name: /subagents/i }));
    await user.selectOptions(screen.getByLabelText(/strategy/i), "tdd");
    await user.click(screen.getByRole("button", { name: /use this mode/i }));
    await waitFor(() => expect(onChosen).toHaveBeenCalledOnce());
    expect(body).toEqual({ mode: "subagents", strategy: "tdd" });
  });

  it("asks for a mode when none is available", async () => {
    server.use(
      http.get("*/api/v1/executions/:id/modes", () =>
        HttpResponse.json({
          items: [
            {
              mode: "agent_teams",
              available: false,
              recommended: false,
              reason: "Teammates could split the work.",
              unavailableReason: "off",
              howToEnable: null,
              runtimes: [],
            },
          ],
        }),
      ),
    );
    const { user } = renderWithProviders(
      <ChooseModeForm execution={execution} onChosen={vi.fn()} />,
    );
    await user.click(await screen.findByRole("button", { name: /use this mode/i }));
    expect(await screen.findByText("Choose an available mode")).toBeInTheDocument();
  });
});
