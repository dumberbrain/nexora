import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useConnectionStore } from "@/shared/socket/client";
import { TooltipProvider } from "@/shared/ui/tooltip";

import { AppShell } from "./app-shell";
import { NAV_ITEMS } from "../model/nav-items";

function renderShell() {
  const root = createRootRoute({
    component: () => (
      <AppShell>
        <Outlet />
      </AppShell>
    ),
  });
  const index = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => <p>home</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([index]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>,
  );
}

describe("AppShell", () => {
  it("renders the content inside a labelled main landmark", async () => {
    renderShell();
    expect(await screen.findByText("home")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
  });

  it("lists every dashboard page; unbuilt ones are disabled with their story", async () => {
    renderShell();
    const nav = (await screen.findAllByRole("navigation", { name: "Main" }))[0]!;
    for (const item of NAV_ITEMS) expect(nav).toHaveTextContent(`/${item.label}`);
    const disabled = nav.querySelectorAll('[aria-disabled="true"]');
    expect(disabled).toHaveLength(NAV_ITEMS.filter((i) => !i.to).length);
    expect(nav.querySelector('a[href="/"]')).toHaveTextContent("/overview");
  });

  it("shows the realtime state, including stale states", async () => {
    useConnectionStore.setState({ state: "reconnecting" });
    renderShell();
    expect(
      await screen.findByRole("status", { name: /reconnecting — data may be stale/i }),
    ).toBeInTheDocument();
    useConnectionStore.setState({ state: "connected" });
  });
});
