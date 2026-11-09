import { Link } from "@tanstack/react-router";

import { type MessageFilters } from "@/entities/message";
import { PageHeader } from "@/shared/ui/layout/page-header";
import { MessageFeed } from "@/widgets/message-feed";

interface CommunicationViewProps {
  filters: MessageFilters;
  onFiltersChange: (next: MessageFilters) => void;
}

/** Communication Center page (FR-027). Filters live in the URL. */
export function CommunicationView({ filters, onFiltersChange }: CommunicationViewProps) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        index="06"
        title="Communication"
        description="Messages between you, the coordinator and agents — newest first, streaming live."
        actions={
          filters.executionId ? (
            <Link
              to="/executions/$executionId"
              params={{ executionId: filters.executionId }}
              className="font-mono text-xs text-phosphor hover:underline"
            >
              ← execution {filters.executionId.slice(-6)}
            </Link>
          ) : null
        }
      />
      <MessageFeed filters={filters} onFiltersChange={onFiltersChange} />
    </div>
  );
}
