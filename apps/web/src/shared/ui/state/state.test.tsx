import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "../tooltip";

import { EmptyState, ErrorState, LoadingState, UnavailableBadge } from ".";

describe("state components", () => {
  it("LoadingState is an accessible busy region", () => {
    render(<LoadingState label="Loading sessions" />);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(region).toHaveTextContent("Loading sessions");
  });

  it("EmptyState shows title, description and action", () => {
    render(
      <EmptyState
        title="No sessions"
        description="Start Claude Code"
        action={<button>Go</button>}
      />,
    );
    expect(screen.getByRole("heading", { name: "No sessions" })).toBeInTheDocument();
    expect(screen.getByText("Start Claude Code")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
  });

  it("ErrorState surfaces the message and retries", async () => {
    const onRetry = vi.fn();
    render(<ErrorState error={new Error("db down")} onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("db down");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("UnavailableBadge exposes its reason to assistive tech", () => {
    render(
      <TooltipProvider>
        <UnavailableBadge reason="runtime does not report usage" />
      </TooltipProvider>,
    );
    const badge = screen.getByText("not available");
    expect(badge).toHaveAccessibleDescription("runtime does not report usage");
  });
});
