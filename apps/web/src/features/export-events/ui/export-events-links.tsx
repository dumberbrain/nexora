import { DownloadIcon } from "lucide-react";

import {
  countEventFilters,
  eventExportUrl,
  type EventFilters,
  type ExportFormat,
} from "@/entities/event";
import { cn } from "@/shared/lib/cn";
import { buttonVariants } from "@/shared/ui/button";

const FORMATS: ExportFormat[] = ["jsonl", "csv"];

interface ExportEventsLinksProps {
  filters: EventFilters;
  className?: string;
}

/**
 * FR-028 export: plain download links for GET /events/export with the current filters. The server
 * streams a redacted file (max 100 000 rows); the session cookie authenticates the GET.
 */
export function ExportEventsLinks({ filters, className }: ExportEventsLinksProps) {
  const scope = countEventFilters(filters) > 0 ? "filtered events" : "all events";
  return (
    <div
      role="group"
      aria-label="Export events"
      className={cn("flex items-center gap-1", className)}
    >
      {FORMATS.map((format) => (
        <a
          key={format}
          href={eventExportUrl(filters, format)}
          download={`nexora-events.${format}`}
          aria-label={`Export ${scope} as ${format.toUpperCase()}`}
          className={cn(
            buttonVariants({ variant: "outline", size: "xs" }),
            "rounded-sm font-mono uppercase",
          )}
        >
          <DownloadIcon aria-hidden="true" />
          {format}
        </a>
      ))}
    </div>
  );
}
