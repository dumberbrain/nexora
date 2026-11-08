import { useState } from "react";

import { type NexoraEvent } from "@/entities/event";
import { useLiveSubscription } from "@/shared/socket/use-live-subscription";

/** How long a node/edge stays highlighted after related activity (FR-025). */
export const PULSE_MS = 1500;

let pulseSeq = 0;

/** Agent a live event belongs to: its agentId, else the session's main agent (id = session id). */
export function agentIdOf(e: Pick<NexoraEvent, "agentId" | "sessionId">): string | null {
  return e.agentId ?? e.sessionId;
}

/**
 * Agent ids with activity in the last PULSE_MS, fed by the global live event stream.
 * Each pulse gets a token so a newer event extends the highlight instead of being cut short.
 */
export function useActivityPulse(): ReadonlySet<string> {
  const [active, setActive] = useState<ReadonlyMap<string, number>>(new Map());

  useLiveSubscription({
    scope: "global",
    onEvents: (events) => {
      const ids = [...new Set(events.map(agentIdOf).filter((id): id is string => id !== null))];
      if (ids.length === 0) return;
      const token = ++pulseSeq;
      setActive((prev) => new Map([...prev, ...ids.map((id) => [id, token] as const)]));
      setTimeout(() => {
        setActive(
          (prev) => new Map([...prev].filter(([id, t]) => !(ids.includes(id) && t === token))),
        );
      }, PULSE_MS);
    },
  });

  return new Set(active.keys());
}
