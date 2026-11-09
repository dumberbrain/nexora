import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AnalysisSummary } from "./analysis-summary";
import { executionFixtures } from "../../../../tests/msw/handlers";

const analysis = executionFixtures[0]!.analysis!;

describe("AnalysisSummary", () => {
  it("lists the detected stack, context and complexity", () => {
    render(<AnalysisSummary analysis={analysis} />);
    const region = screen.getByRole("region", { name: /task analysis/i });
    expect(region).toHaveTextContent(analysis.summary);
    expect(within(region).getByText("medium")).toBeInTheDocument();
    for (const v of ["typescript", "react", "vitest", "CLAUDE.md", "team-frontend", "playwright"]) {
      expect(within(region).getAllByText(v).length).toBeGreaterThan(0);
    }
    expect(within(region).getByText("code-reviewer")).toBeInTheDocument();
  });

  it("states whether the model was used (FR-008)", () => {
    const { rerender } = render(<AnalysisSummary analysis={analysis} />);
    expect(screen.getByText(/local analysis — no model usage/i)).toBeInTheDocument();
    rerender(<AnalysisSummary analysis={{ ...analysis, modelAssisted: true }} />);
    expect(screen.getByText(/model-assisted analysis/i)).toBeInTheDocument();
  });

  it("shows `none` for empty lists and a pending state without analysis", () => {
    const { rerender } = render(
      <AnalysisSummary analysis={{ ...analysis, skills: [], agents: [], mcpServers: [] }} />,
    );
    expect(screen.getAllByText("none")).toHaveLength(3);
    rerender(<AnalysisSummary analysis={null} />);
    expect(screen.getByText(/analysis not available yet/i)).toBeInTheDocument();
  });
});
