import { type GraphIssue, WORKFLOW_NODE_KINDS } from "@nexora/contracts";
import { describe, expect, it } from "vitest";

import { forkJoin, graph, linear, node } from "./graph-fixtures";
import {
  type ValidationCatalog,
  validateGraph,
} from "../../../src/modules/workflow-engine/graph-validator";
import { BUILT_IN_TEMPLATES } from "../../../src/modules/workflow-engine/templates";

const codes = (input: unknown, catalog?: ValidationCatalog): GraphIssue["code"][] =>
  validateGraph(input, catalog).validation.issues.map((i) => i.code);
const issue = (input: unknown, code: GraphIssue["code"], catalog?: ValidationCatalog) =>
  validateGraph(input, catalog).validation.issues.find((i) => i.code === code);

describe("graph validator (T123)", () => {
  it("accepts a linear and a fork/join graph", () => {
    for (const g of [linear(), forkJoin()]) {
      const r = validateGraph(g);
      expect(r.validation).toEqual({ valid: true, issues: [] });
      expect(r.graph?.nodes).toHaveLength(g.nodes.length);
    }
  });

  it("accepts every node kind", () => {
    const g = graph(
      [
        { id: "start", kind: "start" },
        { id: "a", kind: "agent" },
        { id: "s", kind: "skill" },
        { id: "m", kind: "mcp_tool" },
        { id: "c", kind: "condition" },
        { id: "ok", kind: "approval" },
        { id: "fork", kind: "parallel_fork" },
        { id: "p1", kind: "agent" },
        { id: "p2", kind: "agent" },
        { id: "join", kind: "parallel_join" },
        { id: "end", kind: "end" },
      ],
      [
        "start>a",
        "a>s",
        "s>m",
        "m>c",
        "c>ok:true",
        "c>end:false",
        "ok>fork",
        "fork>p1",
        "fork>p2",
        "p1>join",
        "p2>join",
        "join>end",
      ],
    );
    expect(new Set(g.nodes.map((n) => n.kind))).toEqual(new Set(WORKFLOW_NODE_KINDS));
    const catalog = {
      skills: new Map([["release-notes", true]]),
      mcpServers: new Set(["postgres"]),
    };
    expect(validateGraph(g, catalog).validation.issues).toEqual([]);
  });

  it("requires exactly one start node without incoming edges", () => {
    const none = graph(
      [
        { id: "a", kind: "agent" },
        { id: "end", kind: "end" },
      ],
      ["a>end"],
    );
    expect(codes(none)).toContain("start_count");
    const two = linear();
    two.nodes.push(node({ id: "start2", kind: "start" }));
    two.edges.push({ id: "x", source: "start2", target: "a" });
    expect(codes(two)).toContain("start_count");
    const incoming = linear();
    incoming.edges.push({ id: "back", source: "a", target: "start" });
    expect(codes(incoming)).toEqual(expect.arrayContaining(["start_count"]));
  });

  it("requires an end reachable from start and from every node", () => {
    const noEnd = graph(
      [
        { id: "start", kind: "start" },
        { id: "a", kind: "agent" },
      ],
      ["start>a"],
    );
    expect(codes(noEnd)).toContain("end_unreachable");
    const deadEnd = linear();
    deadEnd.nodes.push(node({ id: "b", kind: "agent" }));
    deadEnd.edges.push({ id: "x", source: "a", target: "b" });
    expect(issue(deadEnd, "end_unreachable")?.ref).toBe("b");
  });

  it("rejects cycles, dangling edges and unreachable nodes", () => {
    const cycle = linear();
    cycle.nodes.push(node({ id: "b", kind: "agent" }));
    cycle.edges.push(
      { id: "x", source: "a", target: "b" },
      { id: "y", source: "b", target: "a" },
      { id: "z", source: "b", target: "end" },
    );
    expect(codes(cycle)).toContain("cycle");

    const dangling = linear();
    dangling.edges.push({ id: "ghost", source: "a", target: "nowhere" });
    expect(issue(dangling, "dangling_edge")?.ref).toBe("ghost");

    const island = linear();
    island.nodes.push(node({ id: "lonely", kind: "agent" }));
    island.edges.push({ id: "x", source: "lonely", target: "end" });
    expect(issue(island, "unreachable_node")?.ref).toBe("lonely");
  });

  it("validates node config per kind", () => {
    const g = linear();
    (g.nodes[1] as { config: Record<string, unknown> }).config = { role: "", prompt: "x" };
    expect(issue(g, "invalid_config")?.ref).toBe("a");
    const fork = linear();
    (fork.nodes[0] as { config: Record<string, unknown> }).config = { surprise: true };
    expect(issue(fork, "invalid_config")?.ref).toBe("start");
    const badExpr = graph(
      [
        { id: "start", kind: "start" },
        { id: "c", kind: "condition", config: { expression: "process.exit(1)" } },
        { id: "end", kind: "end" },
      ],
      ["start>c", "c>end:true", "c>end:false"],
    );
    expect(issue(badExpr, "invalid_config")?.ref).toBe("c");
  });

  it("only lets conditions read nodes that run before them", () => {
    const g = graph(
      [
        { id: "start", kind: "start" },
        { id: "c", kind: "condition", config: { expression: 'nodes.b.status == "completed"' } },
        { id: "b", kind: "agent" },
        { id: "end", kind: "end" },
      ],
      ["start>c", "c>b:true", "c>end:false", "b>end"],
    );
    expect(issue(g, "unknown_reference")?.ref).toBe("c");
  });

  it("requires exactly one true and one false edge per condition", () => {
    const g = graph(
      [
        { id: "start", kind: "start" },
        { id: "a", kind: "agent" },
        { id: "c", kind: "condition" },
        { id: "end", kind: "end" },
      ],
      ["start>a", "a>c", "c>end:true", "c>end:true"],
    );
    expect(issue(g, "condition_branches")?.ref).toBe("c");
    const branchOnAgent = linear();
    (branchOnAgent.edges[1] as { branch?: "true" }).branch = "true";
    expect(codes(branchOnAgent)).toContain("condition_branches");
  });

  it("requires forks and joins to pair up", () => {
    const noJoin = graph(
      [
        { id: "start", kind: "start" },
        { id: "fork", kind: "parallel_fork" },
        { id: "a", kind: "agent" },
        { id: "b", kind: "agent" },
        { id: "end", kind: "end" },
      ],
      ["start>fork", "fork>a", "fork>b", "a>end", "b>end"],
    );
    expect(issue(noJoin, "fork_join_mismatch")?.ref).toBe("fork");

    const oneBranch = forkJoin();
    oneBranch.edges = oneBranch.edges.filter((e) => e.target !== "b" && e.source !== "b");
    oneBranch.nodes = oneBranch.nodes.filter((n) => n.id !== "b");
    expect(codes(oneBranch)).toContain("fork_join_mismatch");

    const joinFromOutside = forkJoin();
    joinFromOutside.nodes.push(node({ id: "x", kind: "agent" }));
    joinFromOutside.edges.push(
      { id: "sx", source: "start", target: "x" },
      { id: "xj", source: "x", target: "join" },
    );
    expect(issue(joinFromOutside, "fork_join_mismatch")?.ref).toBe("join");
  });

  it("accepts nested fork/join", () => {
    const g = graph(
      [
        { id: "start", kind: "start" },
        { id: "f1", kind: "parallel_fork" },
        { id: "a", kind: "agent" },
        { id: "f2", kind: "parallel_fork" },
        { id: "b", kind: "agent" },
        { id: "c", kind: "agent" },
        { id: "j2", kind: "parallel_join" },
        { id: "j1", kind: "parallel_join" },
        { id: "end", kind: "end" },
      ],
      ["start>f1", "f1>a", "f1>f2", "f2>b", "f2>c", "b>j2", "c>j2", "j2>j1", "a>j1", "j1>end"],
    );
    expect(validateGraph(g).validation.issues).toEqual([]);
  });

  it("caps retry at 5 attempts", () => {
    const g = linear() as unknown as { nodes: { retry: unknown }[] };
    (g.nodes[1] as { retry: unknown }).retry = { maxAttempts: 6, backoffMs: 0 };
    const r = validateGraph(g);
    expect(r.validation.valid).toBe(false);
    expect(r.validation.issues[0]).toMatchObject({ code: "invalid_config", ref: "a" });
    expect(r.graph).toBeNull();
  });

  it("checks onError goto targets", () => {
    const missing = linear();
    (missing.nodes[1] as { onError: unknown }).onError = { goto: "nope" };
    expect(issue(missing, "on_error_target")?.ref).toBe("a");
    const self = linear();
    (self.nodes[1] as { onError: unknown }).onError = { goto: "a" };
    expect(codes(self)).toContain("on_error_target");
    const ok = linear();
    ok.nodes.push(node({ id: "recover", kind: "agent" }));
    ok.edges.push({ id: "r", source: "recover", target: "end" });
    (ok.nodes[1] as { onError: unknown }).onError = { goto: "recover" };
    expect(validateGraph(ok).validation.issues).toEqual([]);
    const backwards = graph(
      [
        { id: "start", kind: "start" },
        { id: "a", kind: "agent" },
        { id: "b", kind: "agent", onError: { goto: "a" } },
        { id: "end", kind: "end" },
      ],
      ["start>a", "a>b", "b>end"],
    );
    expect(codes(backwards)).toContain("cycle");
  });

  it("allows skill nodes only for executable discovered skills", () => {
    const g = graph(
      [
        { id: "start", kind: "start" },
        { id: "s", kind: "skill", config: { skill: "release-notes", args: "" } },
        { id: "end", kind: "end" },
      ],
      ["start>s", "s>end"],
    );
    expect(codes(g, { skills: new Map([["release-notes", true]]) })).toEqual([]);
    expect(
      issue(g, "skill_not_executable", { skills: new Map([["release-notes", false]]) })?.ref,
    ).toBe("s");
    expect(issue(g, "unknown_reference", { skills: new Map() })?.ref).toBe("s");
    // no catalog: structure only
    expect(codes(g)).toEqual([]);
  });

  it("checks MCP servers against the catalog", () => {
    const g = graph(
      [
        { id: "start", kind: "start" },
        { id: "m", kind: "mcp_tool" },
        { id: "end", kind: "end" },
      ],
      ["start>m", "m>end"],
    );
    expect(issue(g, "unknown_reference", { mcpServers: new Set(["github"]) })?.ref).toBe("m");
    expect(codes(g, { mcpServers: new Set(["postgres"]) })).toEqual([]);
  });

  it("ships valid built-in templates (T130)", () => {
    expect(BUILT_IN_TEMPLATES.map((t) => t.name)).toEqual([
      "Spec-driven feature",
      "TDD feature",
      "Review and merge",
    ]);
    for (const t of BUILT_IN_TEMPLATES) {
      expect(validateGraph(t.graph).validation, t.name).toEqual({ valid: true, issues: [] });
    }
  });

  it("reports duplicate ids and malformed input", () => {
    const dup = linear();
    dup.nodes.push(node({ id: "a", kind: "agent" }));
    expect(codes(dup)).toContain("invalid_config");
    expect(validateGraph({ nodes: "x" }).validation.valid).toBe(false);
    expect(validateGraph(null).validation.issues[0]?.ref).toBeNull();
  });
});
