import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { EventFiltersSchema, type EventFilters } from "@/entities/event";
import { TooltipProvider } from "@/shared/ui/tooltip";

import { LogViewer } from "./log-viewer";
import { eventFixtures } from "../../../../tests/msw/handlers";
import { server } from "../../../../tests/msw/server";
import { createTestQueryClient } from "../../../../tests/render";

// jsdom has no layout: give the virtualised scroll container a real size (virtual-core reads
// clientWidth/clientHeight of the scroll element).
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 600,
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 960,
  });
});
afterAll(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
});

const clean = (s: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) as EventFilters;

/** A /logs route wired exactly like routes/logs.tsx: validateSearch (zod) ↔ LogViewer. */
function renderLogs(url = "/logs") {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get("*/api/v1/events", ({ request }) => {
      requests.push(new URL(request.url).searchParams);
      return undefined; // fall through to the default fixture handler
    }),
  );
  const root = createRootRoute();
  const logs = createRoute({
    getParentRoute: () => root,
    path: "/logs",
    validateSearch: EventFiltersSchema,
    component: function Logs() {
      const navigate = logs.useNavigate();
      return (
        <LogViewer
          filters={clean(logs.useSearch())}
          onFiltersChange={(next) => void navigate({ search: next })}
        />
      );
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([logs]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { router, requests, user: userEvent.setup() };
}

describe("LogViewer", () => {
  it("renders events newest first with source and reliability", async () => {
    renderLogs();
    const list = await screen.findByLabelText("Log lines, newest first");
    const lines = within(list).getAllByRole("listitem");
    expect(lines[0]).toHaveTextContent(eventFixtures.at(-1)!.summary);
    expect(list).toHaveTextContent("derived");
    expect(screen.getByRole("status")).toHaveTextContent(`${eventFixtures.length} events loaded`);
  });

  it("writes text search to the URL and refetches with it", async () => {
    const { router, requests, user } = renderLogs();
    await screen.findByLabelText("Log lines, newest first");
    await user.type(screen.getByLabelText("Search text"), "npm{Enter}");
    await waitFor(() => expect(router.state.location.search).toEqual({ q: "npm" }));
    await waitFor(() => expect(requests.at(-1)?.get("q")).toBe("npm"));
    expect(await screen.findByText("Bash: npm test")).toBeInTheDocument();
    expect(screen.queryByText("Tool Read failed: ENOENT")).not.toBeInTheDocument();
  });

  it("toggles severity and mode filters into the URL", async () => {
    const { router, user } = renderLogs();
    await screen.findByLabelText("Log lines, newest first");
    await user.click(screen.getByRole("button", { name: "error" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ severity: ["error"] }));
    expect(screen.getByRole("button", { name: "error" })).toHaveAttribute("aria-pressed", "true");
    await user.selectOptions(screen.getByLabelText(/mode/i), "subagents");
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ severity: ["error"], mode: "subagents" }),
    );
  });

  it("reads filters from the URL, drops invalid ones and builds export links from them", async () => {
    const { requests } = renderLogs(
      "/logs?sessionId=s-1&severity=%5B%22bogus%22%5D&type=%5B%22error%22%5D",
    );
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    expect(requests[0]!.get("sessionId")).toBe("s-1");
    expect(requests[0]!.get("type")).toBe("error");
    expect(requests[0]!.get("severity")).toBeNull();
    expect(screen.getByLabelText("Session id")).toHaveValue("s-1");
    expect(screen.getByRole("link", { name: /export filtered events as csv/i })).toHaveAttribute(
      "href",
      "/api/v1/events/export?sessionId=s-1&type=error&format=csv",
    );
  });

  it("clears every filter", async () => {
    const { router, user } = renderLogs("/logs?q=%22npm%22");
    await screen.findByLabelText("Search text");
    await user.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(router.state.location.search).toEqual({}));
  });
});
