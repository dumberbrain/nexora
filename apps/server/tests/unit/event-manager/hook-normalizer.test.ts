import { describe, expect, it } from "vitest";

import { normalizeHook } from "../../../src/modules/event-manager/normalizers/hook-normalizer";
import { HookPayloadSchema } from "../../../src/modules/event-manager/normalizers/hook-payload";

const base = { session_id: "s-1", cwd: "/work/repo" };
const norm = (body: Record<string, unknown>) =>
  normalizeHook(HookPayloadSchema.parse({ ...base, ...body }));

describe("normalizeHook", () => {
  it("summarises tools in human-readable form with paths relative to cwd", () => {
    const read = norm({
      hook_event_name: "PreToolUse",
      tool_name: "Read",
      tool_input: { file_path: "/work/repo/src/a.ts" },
    });
    expect(read[0]).toMatchObject({ type: "tool.invoked", summary: "Read src/a.ts" });
    const bash = norm({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "npm test" },
    });
    expect(bash[0]?.summary).toBe("Bash: npm test");
    const outside = norm({
      hook_event_name: "PreToolUse",
      tool_name: "Read",
      tool_input: { file_path: "/etc/hosts" },
    });
    expect(outside[0]?.summary).toBe("Read /etc/hosts");
  });

  it("handles Windows paths case-insensitively", () => {
    const [e] = normalizeHook(
      HookPayloadSchema.parse({
        session_id: "s",
        cwd: "C:\\Work\\Repo",
        hook_event_name: "PreToolUse",
        tool_name: "Edit",
        tool_input: { file_path: "c:\\work\\repo\\src\\b.ts" },
      }),
    );
    expect(e?.summary).toBe("Edit src/b.ts");
  });

  it("adds a derived file.modified for Edit, MultiEdit and NotebookEdit", () => {
    for (const [tool, input] of [
      ["Edit", { file_path: "/work/repo/x.ts" }],
      ["MultiEdit", { file_path: "/work/repo/x.ts" }],
      ["NotebookEdit", { notebook_path: "/work/repo/x.ipynb" }],
    ] as const) {
      const events = norm({ hook_event_name: "PostToolUse", tool_name: tool, tool_input: input });
      expect(events.map((e) => e.type)).toEqual(["tool.completed", "file.modified"]);
      expect(events[1]?.reliability).toBe("derived");
    }
    const read = norm({
      hook_event_name: "PostToolUse",
      tool_name: "Read",
      tool_input: { file_path: "/work/repo/x.ts" },
    });
    expect(read).toHaveLength(1);
  });

  it("maps failures, permissions, notifications, tasks and teammates", () => {
    const cases: [Record<string, unknown>, string, string][] = [
      [
        { hook_event_name: "PostToolUseFailure", tool_name: "Bash", error: "boom" },
        "error",
        "error",
      ],
      [{ hook_event_name: "StopFailure", error: "rate limited" }, "error", "error"],
      [{ hook_event_name: "PermissionRequest", tool_name: "Bash" }, "permission.requested", "warn"],
      [{ hook_event_name: "PermissionDenied", tool_name: "Bash" }, "permission.decided", "warn"],
      [{ hook_event_name: "Notification", message: "Claude needs you" }, "agent.waiting", "info"],
      [{ hook_event_name: "TeammateIdle", teammate_name: "qa" }, "agent.waiting", "info"],
      [{ hook_event_name: "TaskCreated", task_subject: "Write tests" }, "task.created", "info"],
      [{ hook_event_name: "TaskCompleted", task_subject: "Write tests" }, "task.completed", "info"],
    ];
    for (const [body, type, severity] of cases) {
      const [e] = norm(body);
      expect(e, String(body.hook_event_name)).toMatchObject({
        type,
        severity,
        source: "hook",
        reliability: "authoritative",
      });
    }
  });

  it("includes the derived parent linkage in agent.spawned", () => {
    const [e] = normalizeHook(
      HookPayloadSchema.parse({
        ...base,
        hook_event_name: "SubagentStart",
        agent_id: "a1",
        agent_type: "Explore",
      }),
      { parentAgentId: "s-1" },
    );
    expect(e).toMatchObject({ type: "agent.spawned", agentId: "a1" });
    expect(e?.payload).toMatchObject({
      nexora: { parentAgentId: "s-1", parentLinkReliability: "derived" },
    });
  });

  it("emits nothing for hook events without a mapping", () => {
    expect(norm({ hook_event_name: "CwdChanged" })).toEqual([]);
    expect(norm({ hook_event_name: "Unknown" })).toEqual([]);
  });
});
