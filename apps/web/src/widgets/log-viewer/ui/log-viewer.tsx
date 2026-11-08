import { useInfiniteQuery } from "@tanstack/react-query";

import {
  countEventFilters,
  eventFeedQuery,
  flattenFeed,
  useLiveEventFeed,
  type EventFilters,
} from "@/entities/event";
import { ExportEventsLinks } from "@/features/export-events";
import { Button } from "@/shared/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/shared/ui/state";

import { FacetFilters } from "./components/facet-filters";
import { LogList } from "./components/log-list";
import { TextFilters } from "./components/text-filters";
import { applyFilterPatch, type FilterPatch } from "../model/filter-patch";

interface LogViewerProps {
  /** filters live in the URL — the route owns them */
  filters: EventFilters;
  onFiltersChange: (next: EventFilters) => void;
}

/** Live Logs (FR-028): URL-bound filters, live head, virtualised list, older pages, export. */
export function LogViewer({ filters, onFiltersChange }: LogViewerProps) {
  const feed = useInfiniteQuery(eventFeedQuery(filters));
  useLiveEventFeed(filters);
  const patch = (p: FilterPatch) => onFiltersChange(applyFilterPatch(filters, p));
  const events = flattenFeed(feed.data);

  return (
    <section aria-label="Live logs" className="flex flex-col gap-3">
      <TextFilters
        key={JSON.stringify(filters)}
        filters={filters}
        onApply={patch}
        onClear={() => onFiltersChange({})}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FacetFilters filters={filters} onChange={patch} />
        <ExportEventsLinks filters={filters} />
      </div>
      {filters.mode ? (
        <p className="font-mono text-[11px] text-status-paused">
          Live append is paused while filtering by mode — events carry no mode; reload for new rows.
        </p>
      ) : null}

      {feed.isPending ? <LoadingState label="Loading events" rows={8} /> : null}
      {feed.isError ? (
        <ErrorState
          title="Events unavailable"
          error={feed.error}
          onRetry={() => void feed.refetch()}
        />
      ) : null}
      {feed.isSuccess && events.length === 0 ? (
        <EmptyState
          title={countEventFilters(filters) > 0 ? "No events match these filters" : "No events yet"}
          description="New events appear here live as Claude Code sessions report them."
        />
      ) : null}
      {events.length > 0 ? (
        <>
          <p role="status" className="font-mono text-[11px] text-muted-foreground">
            {events.length} events loaded
            {feed.hasNextPage ? " · older events available" : " · start of log"}
          </p>
          <LogList events={events} />
        </>
      ) : null}
      {feed.hasNextPage ? (
        <Button
          variant="outline"
          size="sm"
          className="self-center rounded-sm"
          disabled={feed.isFetchingNextPage}
          onClick={() => void feed.fetchNextPage()}
        >
          {feed.isFetchingNextPage ? "Loading…" : "Load older events"}
        </Button>
      ) : null}
    </section>
  );
}
