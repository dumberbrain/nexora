import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";

import { useConnectionStore } from "@/shared/socket/client";

import { SessionTable } from "./session-table";
import { sessionFixtures } from "../../../../tests/msw/handlers";
import { server } from "../../../../tests/msw/server";
import { renderWithProviders } from "../../../../tests/render";

const [running, idle] = sessionFixtures;

afterEach(() => useConnectionStore.setState({ state: "connecting" }));

async function rowFor(id: string) {
  const link = await screen.findByRole("link", { name: `session ${id}` });
  return link.closest("tr")!;
}

describe("SessionTable", () => {
  it("renders one row per session with the FR-026 columns", async () => {
    useConnectionStore.setState({ state: "connected" });
    renderWithProviders(<SessionTable />);
    const row = await rowFor(running!.id);
    expect(within(row).getByText("observe-only")).toBeInTheDocument();
    expect(within(row).getByText("C:/work/ubuliera")).toBeInTheDocument();
    expect(within(row).getByText("observed")).toBeInTheDocument();
    expect(within(row).getByText("claude-opus-4-5")).toBeInTheDocument();
    expect(within(row).getByText("Running")).toBeInTheDocument();
    expect(within(row).getByText("feat/us1-web")).toBeInTheDocument();
    expect(within(row).getByRole("link")).toHaveAttribute("href", `/sessions/${running!.id}`);
    expect(screen.getAllByRole("row")).toHaveLength(sessionFixtures.length + 1);
  });

  it("marks an unreported model and branch as not available with a reason", async () => {
    renderWithProviders(<SessionTable />);
    const row = await rowFor(idle!.id);
    const unavailable = within(row).getAllByRole("button", { name: /not available/ });
    expect(unavailable.map((b) => b.getAttribute("aria-describedby"))).not.toContain(null);
    expect(row).toHaveTextContent(/the runtime has not reported a model yet/);
    expect(row).toHaveTextContent(/not a git repository/);
  });

  it("flags rows as stale while the realtime link is down", async () => {
    useConnectionStore.setState({ state: "reconnecting" });
    renderWithProviders(<SessionTable />);
    const row = await rowFor(running!.id);
    expect(row).toHaveAttribute("data-stale", "true");
    expect(within(row).getByRole("note")).toHaveTextContent(/realtime link reconnecting/);
  });

  it("shows an honest empty state when nothing was observed", async () => {
    server.use(http.get("*/api/v1/sessions", () => HttpResponse.json({ items: [] })));
    renderWithProviders(<SessionTable />);
    expect(
      await screen.findByRole("heading", { name: "No sessions observed yet" }),
    ).toBeInTheDocument();
  });

  it("surfaces API failures", async () => {
    server.use(
      http.get("*/api/v1/sessions", () =>
        HttpResponse.json({ error: { code: "FORBIDDEN", message: "nope" } }, { status: 403 }),
      ),
    );
    renderWithProviders(<SessionTable />);
    expect(await screen.findByRole("alert")).toHaveTextContent("nope");
  });
});
