import { describe, expect, it } from "vitest";

import { flattenFeed, prependEvents, type EventFeedData } from "./event-feed";
import { eventExportUrl, matchesEventFilters, toEventParams } from "./event-params";
import { makeEvent } from "../../../../tests/msw/handlers";
import { EventFiltersSchema } from "../model/event-filters.schema";

const e1 = makeEvent({
  id: "01JCXK00000000000000000A01",
  type: "tool.invoked",
  summary: "Bash: ls",
});
const e2 = makeEvent({
  id: "01JCXK00000000000000000A02",
  type: "error",
  severity: "error",
  summary: "boom",
});
const e3 = makeEvent({ id: "01JCXK00000000000000000A03", type: "tool.completed", summary: "done" });

describe("event params", () => {
  it("serialises arrays as comma lists and drops empty filters", () => {
    expect(
      toEventParams({ type: ["error", "tool.invoked"], severity: [], q: "npm", from: 0 }),
    ).toEqual({
      type: "error,tool.invoked",
      q: "npm",
      from: "0",
    });
  });

  it("builds a same-origin export URL with the current filters", () => {
    expect(eventExportUrl({ sessionId: "s1", severity: ["error"] }, "csv")).toBe(
      "/api/v1/events/export?sessionId=s1&severity=error&format=csv",
    );
  });
});

describe("matchesEventFilters", () => {
  it("applies every client-checkable filter", () => {
    expect(matchesEventFilters(e2, { type: ["error"], q: "BOO" })).toBe(true);
    expect(matchesEventFilters(e1, { severity: ["error"] })).toBe(false);
    expect(matchesEventFilters(e1, { sessionId: "other" })).toBe(false);
    expect(matchesEventFilters(e1, { to: e1.ts - 1 })).toBe(false);
  });

  it("never claims a live event matches a mode filter (events carry no mode)", () => {
    expect(matchesEventFilters(e1, { mode: "subagents" })).toBe(false);
  });
});

describe("prependEvents", () => {
  const feed: EventFeedData = {
    pages: [{ items: [e2, e1], nextCursor: null }],
    pageParams: [null],
  };

  it("adds unseen live events newest-first at the head", () => {
    const next = prependEvents(feed, [e2, e3]);
    expect(flattenFeed(next).map((e) => e.id)).toEqual([e3.id, e2.id, e1.id]);
  });

  it("leaves an unfetched feed alone", () => {
    expect(prependEvents(undefined, [e3])).toBeUndefined();
  });
});

describe("EventFiltersSchema", () => {
  it("keeps valid values and drops invalid ones instead of throwing", () => {
    expect(
      EventFiltersSchema.parse({
        type: "error",
        severity: ["nope"],
        q: 123,
        from: -5,
        mode: "subagents",
      }),
    ).toEqual({ type: ["error"], q: "123", mode: "subagents" });
  });
});
