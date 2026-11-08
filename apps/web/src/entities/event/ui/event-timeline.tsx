import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";

import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/shared/ui/state";

import { EventLine } from "./event-line";
import { eventFeedQuery } from "../api/event.queries";
import { flattenFeed } from "../lib/event-feed";
import { type EventFilters, type NexoraEvent } from "../model/types";
import { useLiveEventFeed } from "../model/use-live-event-feed";

type View = "all" | "tools" | "errors";
const VIEWS: Array<{ id: View; label: string }> = [
  { id: "all", label: "all" },
  { id: "tools", label: "tool events" },
  { id: "errors", label: "errors" },
];

const KEEP: Record<View, (e: NexoraEvent) => boolean> = {
  all: () => true,
  tools: (e) => e.type.startsWith("tool."),
  errors: (e) => e.severity === "error" || e.type === "error" || e.type.endsWith(".failed"),
};

interface EventTimelineProps {
  /** scope, e.g. { sessionId } or { agentId } — the live room is derived from it */
  filters: EventFilters;
  label: string;
  onLiveEvents?: (events: NexoraEvent[]) => void;
  className?: string;
}

/** Newest-first activity timeline for one scope: REST history + live socket head + load older. */
export function EventTimeline({ filters, label, onLiveEvents, className }: EventTimelineProps) {
  const [view, setView] = useState<View>("all");
  const feed = useInfiniteQuery(eventFeedQuery(filters));
  useLiveEventFeed(filters, onLiveEvents ? { onEvents: onLiveEvents } : {});

  if (feed.isPending) return <LoadingState label={`Loading ${label}`} rows={4} />;
  if (feed.isError)
    return (
      <ErrorState
        title={`${label} unavailable`}
        error={feed.error}
        onRetry={() => void feed.refetch()}
      />
    );

  const items = flattenFeed(feed.data).filter(KEEP[view]);
  return (
    <div className={cn("flex min-h-0 flex-col gap-2", className)}>
      <div role="group" aria-label={`${label} filter`} className="flex gap-1">
        {VIEWS.map((v) => (
          <Button
            key={v.id}
            size="xs"
            variant={view === v.id ? "secondary" : "ghost"}
            aria-pressed={view === v.id}
            className="rounded-sm font-mono uppercase"
            onClick={() => setView(v.id)}
          >
            {v.label}
          </Button>
        ))}
      </div>
      {items.length === 0 ? (
        <EmptyState
          title="No events"
          description="Nothing matching has been observed yet."
          className="py-6"
        />
      ) : (
        <ol
          aria-label={label}
          className="flex flex-col divide-y divide-border border border-border bg-terminal"
        >
          {items.map((e) => (
            <li key={e.id}>
              <EventLine event={e} />
            </li>
          ))}
        </ol>
      )}
      {feed.hasNextPage ? (
        <Button
          variant="outline"
          size="xs"
          className="self-center rounded-sm"
          disabled={feed.isFetchingNextPage}
          onClick={() => void feed.fetchNextPage()}
        >
          {feed.isFetchingNextPage ? "Loading…" : "Load older events"}
        </Button>
      ) : null}
    </div>
  );
}
