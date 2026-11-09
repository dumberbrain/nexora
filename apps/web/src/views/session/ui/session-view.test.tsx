import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SessionView } from "./session-view";
import { managedSessionFixture, sessionFixtures } from "../../../../tests/msw/handlers";
import { renderWithProviders } from "../../../../tests/render";

describe("SessionView controls", () => {
  it("offers capability-derived controls and messaging for a Nexora-managed session", async () => {
    renderWithProviders(<SessionView sessionId={managedSessionFixture.id} />);
    const controls = await screen.findByRole("region", { name: "Controls" });
    const bar = await within(controls).findByRole("toolbar", { name: /session controls/i });
    expect(within(bar).getByRole("button", { name: "Stop" })).not.toHaveAttribute("aria-disabled");
    expect(within(bar).getByRole("button", { name: "Interrupt & hold" })).not.toHaveAttribute(
      "aria-disabled",
    );
    expect(within(controls).getByLabelText(/message to the main agent/i)).toBeEnabled();
  });

  it("keeps an observed session observe-only", async () => {
    renderWithProviders(<SessionView sessionId={sessionFixtures[0]!.id} />);
    const controls = await screen.findByRole("region", { name: "Controls" });
    const stop = await within(controls).findByRole("button", { name: "Stop" });
    expect(stop).toHaveAttribute("aria-disabled", "true");
    expect(stop).toHaveAccessibleDescription(/observe-only/i);
    expect(within(controls).getByLabelText(/message to the main agent/i)).toBeDisabled();
  });
});
