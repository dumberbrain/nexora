import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeAll, describe, expect, it } from "vitest";

import { AgentCanvas } from "./agent-canvas";
import { agentFixtures } from "../../../../tests/msw/handlers";
import { server } from "../../../../tests/msw/server";
import { renderWithProviders } from "../../../../tests/render";
import { toFlow } from "../lib/to-flow";

// React Flow measures its viewport — jsdom has no layout engine.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe("AgentCanvas", () => {
  it("renders an AgentNode per agent with name, kind, current task and status", async () => {
    renderWithProviders(<AgentCanvas />);
    expect(await screen.findByText("code-reviewer")).toBeInTheDocument();
    expect(screen.getByText("general-purpose")).toBeInTheDocument();
    expect(screen.getAllByText("main")).toHaveLength(2);
    expect(screen.getByText("T-4")).toBeInTheDocument();
    expect(screen.getAllByText("Running").length).toBeGreaterThan(0);
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getAllByText("subagent").length).toBe(2);
  });

  it("links every node to the agent details route", async () => {
    renderWithProviders(<AgentCanvas />);
    const link = (await screen.findByText("code-reviewer")).closest("a");
    expect(link).toHaveAttribute("href", "/agents/toolu_01AbCdEf");
  });

  it("shows an honest empty state when no agents were observed", async () => {
    server.use(http.get("*/api/v1/agents", () => HttpResponse.json({ items: [] })));
    renderWithProviders(<AgentCanvas />);
    expect(await screen.findByRole("heading", { name: "No agents yet" })).toBeInTheDocument();
  });

  it("requests only one session's tree when scoped", async () => {
    let query = "";
    server.use(
      http.get("*/api/v1/agents", ({ request }) => {
        query = new URL(request.url).search;
        return HttpResponse.json({ items: [] });
      }),
    );
    renderWithProviders(<AgentCanvas sessionId="abc" />);
    await waitFor(() => expect(query).toContain("sessionId=abc"));
  });
});

describe("toFlow", () => {
  it("builds parent→child edges and lights up pulsing nodes and their incoming edge", () => {
    const { nodes, edges } = toFlow(agentFixtures, new Set(["toolu_01AbCdEf"]));
    expect(nodes).toHaveLength(agentFixtures.length);
    expect(edges.map((e) => `${e.source}->${e.target}`)).toEqual([
      `${agentFixtures[0]!.id}->toolu_01AbCdEf`,
      `${agentFixtures[0]!.id}->toolu_02GhIjKl`,
    ]);
    expect(nodes.find((n) => n.id === "toolu_01AbCdEf")!.data.pulsing).toBe(true);
    expect(edges.find((e) => e.target === "toolu_01AbCdEf")!.animated).toBe(true);
    expect(edges.find((e) => e.target === "toolu_02GhIjKl")!.animated).toBe(false);
  });
});
