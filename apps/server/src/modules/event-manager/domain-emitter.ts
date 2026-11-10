import { type EntityChanged, type UbulieraEvent } from "@ubuliera/contracts";

import { type EventBus } from "./event-bus";
import { type EventInput, type EventStore } from "./event-store";

export type DomainEventInput = Omit<EventInput, "source" | "reliability" | "severity"> &
  Partial<Pick<EventInput, "source" | "reliability" | "severity">>;

/**
 * Orchestrator-side event producer: persisted events (source `orchestrator`, authoritative,
 * redacted and size-capped by the EventStore) plus `entity.changed` patches for the UI.
 */
export class DomainEmitter {
  constructor(
    private readonly store: EventStore,
    private readonly bus: EventBus,
  ) {}

  event(input: DomainEventInput): UbulieraEvent {
    return this.store.append({
      source: "orchestrator",
      reliability: "authoritative",
      severity: "info",
      ...input,
    });
  }

  entity(kind: EntityChanged["kind"], id: string, patch: Record<string, unknown>): void {
    this.bus.publishEntityChanged({ kind, id, patch });
  }
}
