import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { IntegrationsView } from "./integrations-view";
import { projectFixtures } from "../../../../tests/msw/handlers";
import { server } from "../../../../tests/msw/server";
import { renderWithProviders } from "../../../../tests/render";
import { type IntegrationsSearch } from "../model/integrations-search";

function Harness({
  initial = {},
  onChange,
}: {
  initial?: IntegrationsSearch;
  onChange?: (next: IntegrationsSearch) => void;
}) {
  const [search, setSearch] = useState<IntegrationsSearch>(initial);
  return (
    <IntegrationsView
      search={search}
      onSearchChange={(next) => {
        onChange?.(next);
        setSearch(next);
      }}
    />
  );
}

const row = (list: HTMLElement, name: string) => within(list).getByRole("listitem", { name });

describe("IntegrationsView", () => {
  it("lists skills and commands with scope, executable and permission badges", async () => {
    renderWithProviders(<Harness />);
    const list = await screen.findByRole("list", { name: "Skills" });
    const skill = row(list, "speckit-plan");
    expect(within(skill).getByText("scope: project")).toBeInTheDocument();
    expect(within(skill).getByText("executable")).toBeInTheDocument();
    expect(within(skill).getByText("health: ok")).toBeInTheDocument();
    expect(within(skill).getByText("permission: allowed")).toBeInTheDocument();
    expect(within(skill).getByText("Generate the implementation plan")).toBeInTheDocument();

    const command = row(list, "review");
    expect(within(command).getByText("command")).toBeInTheDocument();
    expect(within(command).getByText("not executable")).toBeInTheDocument();
    expect(within(command).getByText("permission: ask")).toBeInTheDocument();
    // MCP servers live in their own tab
    expect(within(list).queryByRole("listitem", { name: "playwright" })).not.toBeInTheDocument();
  });

  it("shows agent definitions in the Agents tab", async () => {
    const { user } = renderWithProviders(<Harness />);
    await user.click(await screen.findByRole("tab", { name: "Agents" }));
    const list = await screen.findByRole("list", { name: "Agents" });
    const agent = row(list, "code-reviewer");
    expect(within(agent).getByText("scope: plugin")).toBeInTheDocument();
    expect(within(agent).getByText("Read, Grep")).toBeInTheDocument();
    expect(within(agent).queryByText("executable")).not.toBeInTheDocument();
  });

  it("shows MCP servers with tools, health detail and redacted secrets", async () => {
    renderWithProviders(<Harness initial={{ tab: "mcp" }} />);
    const list = await screen.findByRole("list", { name: "MCP servers" });

    const pw = row(list, "playwright");
    const tools = within(pw).getByRole("list", { name: "Tools of playwright" });
    expect(within(tools).getByText("browser_click")).toBeInTheDocument();
    expect(within(tools).getByText("Click an element")).toBeInTheDocument();
    expect(within(tools).getByText("permission: ask")).toBeInTheDocument();
    // env key names are shown, values never are
    expect(within(pw).getByText("PLAYWRIGHT_TOKEN")).toBeInTheDocument();
    expect(within(pw).getByText("redacted")).toBeInTheDocument();
    expect(pw).not.toHaveTextContent("[REDACTED]");

    const remote = row(list, "remote-docs");
    expect(within(remote).getByText("health: down")).toBeInTheDocument();
    expect(within(remote).getByText("timed out after 5 s")).toBeInTheDocument();
    expect(within(remote).getByText("permission: needs auth")).toBeInTheDocument();
    expect(within(remote).getByText("No tools reported")).toBeInTheDocument();
  });

  it("re-runs discovery with ?refresh=true and shows the new health", async () => {
    const seen: string[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.url.includes("/integrations")) seen.push(new URL(request.url).search);
    });
    const { user } = renderWithProviders(<Harness initial={{ tab: "mcp" }} />);
    const list = await screen.findByRole("list", { name: "MCP servers" });
    expect(within(row(list, "remote-docs")).getByText("health: down")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() =>
      expect(within(row(list, "remote-docs")).getByText("health: degraded")).toBeInTheDocument(),
    );
    expect(
      within(row(list, "remote-docs")).getByText("slow handshake (4.2 s)"),
    ).toBeInTheDocument();
    expect(seen.some((s) => s.includes("refresh=true"))).toBe(true);
    server.events.removeAllListeners();
  });

  it("filters by project through the search params", async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(<Harness onChange={onChange} />);
    await screen.findByRole("list", { name: "Skills" });
    const select = screen.getByRole("combobox", { name: "Project" });
    await screen.findByRole("option", { name: projectFixtures[1]!.name });
    await user.selectOptions(select, projectFixtures[1]!.id);
    expect(onChange).toHaveBeenLastCalledWith({ projectId: projectFixtures[1]!.id });
    // P002 has no integrations in the fixtures
    expect(await screen.findByText("No skills or commands discovered")).toBeInTheDocument();
  });

  it("surfaces a failed inventory with a retry", async () => {
    server.use(
      http.get("*/api/v1/integrations", () =>
        HttpResponse.json(
          { error: { code: "INTERNAL", message: "discovery failed" } },
          { status: 500 },
        ),
      ),
    );
    renderWithProviders(<Harness />);
    expect(await screen.findByText("Integrations unavailable")).toBeInTheDocument();
  });
});
