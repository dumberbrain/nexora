import { type ReactNode } from "react";

import { type TaskAnalysis } from "@/entities/execution";
import { cn } from "@/shared/lib/cn";
import { humanize } from "@/shared/lib/humanize";

interface AnalysisSummaryProps {
  analysis: TaskAnalysis | null;
  className?: string;
}

const COMPLEXITY_STYLE: Record<TaskAnalysis["complexity"], string> = {
  low: "border-status-completed/50 text-status-completed",
  medium: "border-status-waiting/50 text-status-waiting",
  high: "border-status-paused/60 text-status-paused",
  very_high: "border-status-failed/60 text-status-failed",
};

function Tags({ values }: { values: readonly string[] }) {
  if (values.length === 0) return <span className="text-muted-foreground">none</span>;
  return (
    <ul className="flex flex-wrap gap-1">
      {values.map((v) => (
        <li key={v} className="border border-border px-1.5 py-0.5">
          {v}
        </li>
      ))}
    </ul>
  );
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="pt-0.5 text-muted-foreground">{term}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

/**
 * What Ubuliera found about the task before anything runs (US2-AS1): stack, instruction files,
 * skills, agents, MCP servers, complexity — and whether the model was used to find it (FR-008).
 */
export function AnalysisSummary({ analysis, className }: AnalysisSummaryProps) {
  const box = cn("flex flex-col gap-3 border border-border bg-card p-4", className);
  if (!analysis) {
    return (
      <section aria-label="Task analysis" className={box}>
        <p className="font-mono text-xs text-muted-foreground">Analysis not available yet.</p>
      </section>
    );
  }
  const { stack } = analysis;
  return (
    <section aria-label="Task analysis" className={box}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm tracking-widest">Analysis</h2>
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
          {analysis.modelAssisted ? "model-assisted analysis" : "local analysis — no model usage"}
        </span>
      </div>
      <p className="text-sm text-foreground">{analysis.summary}</p>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 font-mono text-[11px]">
        <Row term="complexity">
          <span
            className={cn("border px-1.5 py-0.5 uppercase", COMPLEXITY_STYLE[analysis.complexity])}
          >
            {humanize(analysis.complexity)}
          </span>
        </Row>
        <Row term="languages">
          <Tags values={stack.languages} />
        </Row>
        <Row term="frameworks">
          <Tags values={stack.frameworks} />
        </Row>
        <Row term="package manager">{stack.packageManager ?? "unknown"}</Row>
        <Row term="test runners">
          <Tags values={stack.testRunners} />
        </Row>
        <Row term="instructions">
          <Tags values={analysis.instructionFiles} />
        </Row>
        <Row term="skills">
          <Tags values={analysis.skills} />
        </Row>
        <Row term="agents">
          <Tags values={analysis.agents} />
        </Row>
        <Row term="mcp servers">
          <Tags values={analysis.mcpServers} />
        </Row>
      </dl>
    </section>
  );
}
