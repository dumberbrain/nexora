import { type Usage } from "@/entities/session";
import { UnavailableBadge } from "@/shared/ui/state";

const fmt = new Intl.NumberFormat("en-US");

/**
 * FR-029: token usage and cost only when the runtime reported them (session-level), otherwise an
 * explicit "not available" — never 0, never an estimate made by Nexora.
 */
export function UsageSummary({ usage }: { usage: Usage | null }) {
  if (usage === null) return <UnavailableBadge reason="runtime does not report usage" />;
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 font-mono text-xs">
      <dt className="text-muted-foreground">input tokens</dt>
      <dd className="tabular-nums">{fmt.format(usage.inputTokens)}</dd>
      <dt className="text-muted-foreground">output tokens</dt>
      <dd className="tabular-nums">{fmt.format(usage.outputTokens)}</dd>
      <dt className="text-muted-foreground">cost</dt>
      <dd className="tabular-nums">
        {usage.costUsd === null ? (
          <UnavailableBadge reason="runtime reported tokens but no cost" />
        ) : (
          <>
            ${usage.costUsd.toFixed(2)}
            {usage.costIsEstimate ? (
              <span className="ms-1 text-muted-foreground">(runtime estimate)</span>
            ) : null}
          </>
        )}
      </dd>
      <dd className="col-span-2 text-[10px] text-muted-foreground">
        reported for the whole session, not per agent
      </dd>
    </dl>
  );
}
