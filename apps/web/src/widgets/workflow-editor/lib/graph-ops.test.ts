import { describe, expect, it } from "vitest";

import { defaultGraph } from "@/entities/workflow";

import { addNode, connect, nextBranch, removeEdge, removeNode, updateNode } from "./graph-ops";

describe("graph ops", () => {
  it("adds a node of a kind with a unique id below the lowest node", () => {
    const one = addNode(defaultGraph(), "agent");
    expect(one.id).toBe("agent-1");
    const two = addNode(one.graph, "agent");
    expect(two.id).toBe("agent-2");
    const added = two.graph.nodes.find((n) => n.id === "agent-2")!;
    expect(added).toMatchObject({ kind: "agent", label: "Agent 2", onError: "fail" });
    expect(added.position.y).toBeGreaterThan(240);
  });

  it("connects two nodes once, never to itself", () => {
    const { graph } = addNode(defaultGraph(), "agent");
    const linked = connect(graph, "start", "agent-1");
    expect(linked.edges.map((e) => e.id)).toContain("e-start-agent-1");
    expect(connect(linked, "start", "agent-1")).toBe(linked);
    expect(connect(linked, "agent-1", "agent-1")).toBe(linked);
  });

  it("labels condition edges true, then false, then refuses a third", () => {
    let { graph } = addNode(defaultGraph(), "condition");
    graph = addNode(graph, "agent").graph;
    expect(nextBranch(graph, "condition-1")).toBe("true");
    graph = connect(graph, "condition-1", "agent-1");
    expect(graph.edges.at(-1)).toMatchObject({ branch: "true" });
    graph = connect(graph, "condition-1", "end");
    expect(graph.edges.at(-1)).toMatchObject({ branch: "false" });
    expect(nextBranch(graph, "condition-1")).toBeNull();
    expect(connect(graph, "condition-1", "start")).toBe(graph);
  });

  it("honours an explicit branch", () => {
    const { graph } = addNode(defaultGraph(), "condition");
    const linked = connect(graph, "condition-1", "end", "false");
    expect(linked.edges.at(-1)).toMatchObject({ branch: "false" });
  });

  it("removes a node with its edges and goto references, but never start or end", () => {
    let { graph } = addNode(defaultGraph(), "agent");
    graph = connect(connect(graph, "start", "agent-1"), "agent-1", "end");
    graph = updateNode(graph, "start", { onError: { goto: "agent-1" } });
    const removed = removeNode(graph, "agent-1");
    expect(removed.nodes.map((n) => n.id)).toEqual(["start", "end"]);
    expect(removed.edges.map((e) => e.id)).toEqual(["e-start-end"]);
    expect(removed.nodes[0]!.onError).toBe("fail");
    expect(removeNode(removed, "start")).toBe(removed);
  });

  it("removes one edge and updates node fields", () => {
    const graph = removeEdge(defaultGraph(), "e-start-end");
    expect(graph.edges).toEqual([]);
    expect(updateNode(graph, "end", { label: "Done" }).nodes[1]!.label).toBe("Done");
  });
});
