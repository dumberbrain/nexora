import { describe, expect, it } from "vitest";

import { layoutAgentTree, NODE_HEIGHT, NODE_WIDTH, type LayoutAgent } from "./layout-tree";

const a = (id: string, parentAgentId: string | null, sessionId = "s1"): LayoutAgent => ({
  id,
  parentAgentId,
  sessionId,
});

const pos = (r: ReturnType<typeof layoutAgentTree>, id: string) =>
  r.nodes.find((n) => n.id === id)!;

describe("layoutAgentTree", () => {
  it("centres a parent over its children one row above them", () => {
    const r = layoutAgentTree([a("main", null), a("c1", "main"), a("c2", "main")]);
    const [main, c1, c2] = ["main", "c1", "c2"].map((id) => pos(r, id));
    expect(c1!.y).toBe(c2!.y);
    expect(c1!.y - main!.y).toBeGreaterThan(NODE_HEIGHT);
    expect(c2!.x - c1!.x).toBeGreaterThanOrEqual(NODE_WIDTH);
    expect(main!.x).toBe((c1!.x + c2!.x) / 2);
    expect(r.edges).toEqual([
      { id: "main->c1", source: "main", target: "c1" },
      { id: "main->c2", source: "main", target: "c2" },
    ]);
  });

  it("is deterministic regardless of input order", () => {
    const agents = [
      a("m1", null, "s1"),
      a("x", "m1", "s1"),
      a("y", "m1", "s1"),
      a("m2", null, "s2"),
      a("z", "x", "s1"),
    ];
    const forward = layoutAgentTree(agents);
    const backward = layoutAgentTree([...agents].reverse());
    const norm = (r: typeof forward) => [...r.nodes].sort((p, q) => (p.id < q.id ? -1 : 1));
    expect(norm(backward)).toEqual(norm(forward));
    expect(backward.edges).toEqual(forward.edges);
  });

  it("never overlaps nodes on the same row", () => {
    const r = layoutAgentTree([
      a("m1", null),
      a("c1", "m1"),
      a("g1", "c1"),
      a("g2", "c1"),
      a("c2", "m1"),
      a("m2", null, "s2"),
    ]);
    const rows = new Map<number, typeof r.nodes>();
    for (const n of r.nodes) rows.set(n.depth, [...(rows.get(n.depth) ?? []), n]);
    for (const row of rows.values()) {
      const xs = row.map((n) => n.x).sort((p, q) => p - q);
      xs.slice(1).forEach((x, i) => expect(x - xs[i]!).toBeGreaterThanOrEqual(NODE_WIDTH));
    }
  });

  it("treats agents with an unknown parent as roots and survives cycles", () => {
    const r = layoutAgentTree([a("orphan", "missing"), a("p", "q"), a("q", "p")]);
    expect(r.nodes.map((n) => n.id).sort()).toEqual(["orphan", "p", "q"]);
    expect(pos(r, "orphan").depth).toBe(0);
  });
});
