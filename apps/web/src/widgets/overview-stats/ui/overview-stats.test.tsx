import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { statsKey } from "@/shared/api";
import { useConnectionStore } from "@/shared/socket/client";

import { OverviewStats } from "./overview-stats";
import { statsFixture } from "../../../../tests/msw/handlers";
import { renderWithProviders } from "../../../../tests/render";

afterEach(() => useConnectionStore.setState({ state: "connecting" }));

describe("OverviewStats", () => {
  it("renders the 8 FR-024 counters from GET /stats in a fixed order", async () => {
    useConnectionStore.setState({ state: "connected" });
    renderWithProviders(<OverviewStats />);
    const cards = await screen.findAllByRole("article");
    expect(cards.map((c) => c.getAttribute("aria-label"))).toEqual([
      "Active sessions",
      "Active agents",
      "Idle agents",
      "Completed tasks",
      "Failed tasks",
      "Pending approvals",
      "Running workflows",
      "Current mode",
    ]);
    expect(within(cards[0]!).getByText("2")).toBeInTheDocument();
    expect(within(cards[3]!).getByText("12")).toBeInTheDocument();
    expect(within(cards[7]!).getByText("none")).toBeInTheDocument();
    expect(screen.getByText("● live")).toBeInTheDocument();
  });

  it("re-renders when the socket bridge pushes new stats", async () => {
    const { queryClient } = renderWithProviders(<OverviewStats />);
    await screen.findAllByRole("article");
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    act(() => {
      queryClient.setQueryData(statsKey, {
        ...statsFixture,
        activeSessions: 7,
        currentMode: "subagents",
      });
    });
    const active = screen.getByRole("article", { name: "Active sessions" });
    expect(await within(active).findByText("7")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Current mode" })).toHaveTextContent("subagents");
  });

  it("warns that counters may be stale while realtime is down", async () => {
    useConnectionStore.setState({ state: "reconnecting" });
    renderWithProviders(<OverviewStats />);
    expect(await screen.findByText(/may be stale/)).toBeInTheDocument();
  });
});
