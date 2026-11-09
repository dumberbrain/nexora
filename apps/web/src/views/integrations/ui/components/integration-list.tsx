import { type IntegrationItem } from "@/entities/integration";
import { EmptyState } from "@/shared/ui/state";

import { IntegrationRow } from "./integration-row";

interface IntegrationListProps {
  label: string;
  items: IntegrationItem[];
  emptyTitle: string;
  emptyDescription: string;
}

export function IntegrationList({
  label,
  items,
  emptyTitle,
  emptyDescription,
}: IntegrationListProps) {
  if (items.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return (
    <ul aria-label={label} className="flex flex-col divide-y divide-border border border-border">
      {items.map((item) => (
        <IntegrationRow key={item.id} item={item} />
      ))}
    </ul>
  );
}
