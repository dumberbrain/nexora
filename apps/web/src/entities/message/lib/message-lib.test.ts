import { describe, expect, it } from "vitest";

import {
  matchesMessageFilters,
  messageFromEvent,
  participantLabel,
  prependMessages,
} from "./message-lib";
import { makeEvent, messageFixtures } from "../../../../tests/msw/handlers";

const [m3, m2] = messageFixtures as [(typeof messageFixtures)[0], (typeof messageFixtures)[0]];

describe("participantLabel", () => {
  it("names users, the coordinator and agents", () => {
    expect(participantLabel({ kind: "user" })).toBe("you");
    expect(participantLabel({ kind: "coordinator" })).toBe("coordinator");
    expect(participantLabel({ kind: "agent", agentId: "frontend-dev" })).toBe("frontend-dev");
  });
});

describe("messageFromEvent", () => {
  it("rebuilds the Message recorded by the communication manager", () => {
    const e = makeEvent({
      id: "01JCXK0000000000000000E777",
      type: "message.sent",
      executionId: m2.executionId,
      taskId: "T-1",
      summary: "Please also add tests",
      ts: 42,
      payload: {
        messageId: "01JCXK0000000000000000M777",
        from: { kind: "user" },
        to: { kind: "agent", agentId: "frontend-dev" },
        type: "instruction",
      },
    });
    expect(messageFromEvent(e)).toEqual({
      id: "01JCXK0000000000000000M777",
      executionId: m2.executionId,
      taskId: "T-1",
      from: { kind: "user" },
      to: { kind: "agent", agentId: "frontend-dev" },
      type: "instruction",
      summary: "Please also add tests",
      ts: 42,
    });
  });

  it("ignores other events and message events without a message payload", () => {
    const base = { id: "01JCXK0000000000000000E778", summary: "x" };
    expect(messageFromEvent(makeEvent({ ...base, type: "tool.invoked" }))).toBeNull();
    // hook-sourced UserPromptSubmit carries no Message payload
    expect(messageFromEvent(makeEvent({ ...base, type: "message.sent" }))).toBeNull();
  });
});

describe("prependMessages", () => {
  it("puts new messages first, newest first, without duplicates", () => {
    const old = { items: [m2], nextCursor: null };
    const next = prependMessages(old, [m2, m3]);
    expect(next?.items.map((m) => m.id)).toEqual([m3.id, m2.id]);
  });

  it("keeps an uncached feed untouched", () => {
    expect(prependMessages(undefined, [m3])).toBeUndefined();
  });
});

describe("matchesMessageFilters", () => {
  it("matches execution, task and type filters", () => {
    expect(matchesMessageFilters(m3, {})).toBe(true);
    expect(matchesMessageFilters(m3, { executionId: m3.executionId!, taskId: "T-2" })).toBe(true);
    expect(matchesMessageFilters(m3, { taskId: "T-1" })).toBe(false);
    expect(matchesMessageFilters(m3, { type: "instruction" })).toBe(false);
  });
});
