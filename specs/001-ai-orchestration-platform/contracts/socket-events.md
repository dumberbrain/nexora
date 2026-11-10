# Contract: Real-time channel (Socket.IO)

Endpoint: same origin, path `/socket.io`, namespace `/live`. Auth during handshake: session
cookie (loopback web) or `auth: { token }` (remote). Payloads validated with zod schemas from
`@ubuliera/contracts` on both ends.

## Client → server

| Event | Payload | Ack |
|---|---|---|
| `subscribe` | `{ scope: "global" \| "execution" \| "session" \| "agent", id?, sinceEventId?: ULID }` | `{ ok, replayed: number, gap: boolean }` |
| `unsubscribe` | `{ scope, id? }` | `{ ok }` |

Rooms: `global`, `execution:<id>`, `session:<id>`, `agent:<id>`.

## Server → client

| Event | Payload |
|---|---|
| `event` | `UbulieraEvent` (see data-model Event) — the only stream for logs/timelines |
| `entity.changed` | `{ kind: "execution"\|"task"\|"session"\|"agent"\|"approval"\|"workflowRun", id, patch }` — clients update TanStack Query cache via `setQueryData` or invalidate the exact key |
| `stats` | Overview counters, throttled to ≤ 2/s |
| `replay.done` | `{ lastEventId }` |

## Reconnection & replay (SC-006)

1. Client stores `lastEventId` (ULID, monotonic) per subscription.
2. On reconnect it re-sends `subscribe` with `sinceEventId`.
3. Server replays persisted events `> sinceEventId` in id order (max 5 000; beyond that `gap: true`
   and client refetches lists via REST), then `replay.done`, then live events.
4. Client dedupes by event id.

## Back-pressure (SC-007)

Server batches `event` emissions per room every 100 ms (`event` may carry an array `events[]`);
`stats` throttled; payload `summary` only — full payload fetched on demand via REST.
