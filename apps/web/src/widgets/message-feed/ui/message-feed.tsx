import { MESSAGE_TYPES } from "@nexora/contracts";
import { useQuery } from "@tanstack/react-query";
import { useId } from "react";

import {
  MESSAGE_TYPE_LABEL,
  MessageLine,
  messageListQuery,
  type MessageFilters,
  type MessageType,
  useLiveMessages,
} from "@/entities/message";
import { cn } from "@/shared/lib/cn";
import { EmptyState, ErrorState, LoadingState } from "@/shared/ui/state";

interface MessageFeedProps {
  filters: MessageFilters;
  onFiltersChange: (next: MessageFilters) => void;
  className?: string;
}

const SELECT =
  "h-8 rounded-sm border border-input bg-background px-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * Communication Center (FR-027): user-visible messages between you, the coordinator and agents,
 * live via `message.sent`. Only redacted summaries — never private model reasoning.
 */
export function MessageFeed({ filters, onFiltersChange, className }: MessageFeedProps) {
  const typeId = useId();
  const messages = useQuery(messageListQuery(filters));
  useLiveMessages(filters);

  const setType = (value: string) => {
    const { type: _drop, ...rest } = filters;
    onFiltersChange(value ? { ...rest, type: value as MessageType } : rest);
  };

  return (
    <section aria-label="Communication Center" className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="font-mono text-[11px] text-muted-foreground">
          Instructions, questions, answers, review requests and results — private reasoning is never
          shown.
        </p>
        <div className="flex flex-col gap-1">
          <label htmlFor={typeId} className="font-mono text-[10px] tracking-widest uppercase">
            Type
          </label>
          <select
            id={typeId}
            className={SELECT}
            value={filters.type ?? ""}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">All types</option>
            {MESSAGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {MESSAGE_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {messages.isPending ? <LoadingState label="Loading messages" rows={5} /> : null}
      {messages.isError ? (
        <ErrorState
          title="Messages unavailable"
          error={messages.error}
          onRetry={() => void messages.refetch()}
        />
      ) : null}
      {messages.data?.items.length === 0 ? (
        <EmptyState
          title="No messages yet"
          description="Messages appear when you, the coordinator or agents of a Nexora execution talk to each other."
        />
      ) : null}
      {messages.data && messages.data.items.length > 0 ? (
        <ol
          aria-label="Messages"
          className="flex flex-col divide-y divide-border border border-border bg-terminal"
        >
          {messages.data.items.map((m) => (
            <li key={m.id}>
              <MessageLine message={m} />
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
