import { Link } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

import { EventLine, type UbulieraEvent } from "@/entities/event";

const ROW_ESTIMATE = 30;
const LINK =
  "font-mono text-[10px] text-muted-foreground hover:text-phosphor focus-visible:text-phosphor";

function Meta({ event }: { event: UbulieraEvent }) {
  return (
    <span className="flex shrink-0 gap-2">
      {event.sessionId ? (
        <Link
          to="/sessions/$sessionId"
          params={{ sessionId: event.sessionId }}
          className={LINK}
          title={event.sessionId}
        >
          s:{event.sessionId.slice(0, 8)}
        </Link>
      ) : null}
      {event.agentId && event.agentId !== event.sessionId ? (
        <Link
          to="/agents/$agentId"
          params={{ agentId: event.agentId }}
          className={LINK}
          title={event.agentId}
        >
          a:{event.agentId.slice(0, 12)}
        </Link>
      ) : null}
    </span>
  );
}

interface LogListProps {
  events: UbulieraEvent[];
}

/** Virtualised newest-first log (only visible rows are in the DOM; rows measure their height). */
export function LogList({ events }: LogListProps) {
  "use no memo"; // useVirtualizer returns non-memoisable functions (React Compiler opt-out)
  const parentRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- component opted out of memoisation above
  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 12,
    getItemKey: (i) => events[i]?.id ?? i,
    // first paint (and jsdom) before the scroll element is measured
    initialRect: { width: 960, height: 600 },
  });

  return (
    <div
      ref={parentRef}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard-scrollable (axe scrollable-region-focusable)
      tabIndex={0}
      aria-label="Log lines, newest first"
      className="h-[60vh] min-h-80 overflow-auto border border-border bg-terminal"
    >
      <ol className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => {
          const event = events[row.index];
          if (!event) return null;
          return (
            <li
              key={row.key}
              data-index={row.index}
              ref={virtualizer.measureElement}
              className="absolute inset-x-0 top-0 border-b border-border/60"
              style={{ transform: `translateY(${row.start}px)` }}
            >
              <EventLine event={event} meta={<Meta event={event} />} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
