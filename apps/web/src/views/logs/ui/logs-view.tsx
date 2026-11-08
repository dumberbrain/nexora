import { type EventFilters } from "@/entities/event";
import { PageHeader } from "@/shared/ui/layout/page-header";
import { LogViewer } from "@/widgets/log-viewer";

interface LogsViewProps {
  filters: EventFilters;
  onFiltersChange: (next: EventFilters) => void;
}

/** Live Logs page (FR-028). Filters are the URL — shareable and back-button friendly. */
export function LogsView({ filters, onFiltersChange }: LogsViewProps) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        index="07"
        title="Live logs"
        description="Every normalised event, newest first, with its source and how reliable it is. New events stream in live."
      />
      <LogViewer filters={filters} onFiltersChange={onFiltersChange} />
    </div>
  );
}
