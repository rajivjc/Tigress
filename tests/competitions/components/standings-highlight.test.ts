import { describe, it, expect } from "vitest";
import { StandingsTable } from "@/competitions/components/StandingsTable";
import type { ReactElement } from "react";

interface RenderableNode {
  type?: unknown;
  props?: Record<string, unknown> & { children?: unknown };
}

function flatten(node: unknown): RenderableNode[] {
  if (node === null || node === undefined || typeof node !== "object") return [];
  const n = node as RenderableNode;
  const out: RenderableNode[] = [n];
  const children = n.props?.children;
  if (Array.isArray(children)) {
    for (const c of children) out.push(...flatten(c));
  } else if (children !== undefined) {
    out.push(...flatten(children));
  }
  return out;
}

const ROWS = [
  {
    entrantId: "team-alpha",
    played: 1,
    won: 1,
    drawn: 0,
    lost: 0,
    subMatchesWon: 2,
    subMatchesLost: 1,
    subMatchDiff: 1,
    framesWon: 0,
    framesLost: 0,
    frameDiff: 0,
    awayWins: 0,
    points: 3,
    position: 1,
  },
  {
    entrantId: "team-bravo",
    played: 1,
    won: 0,
    drawn: 0,
    lost: 1,
    subMatchesWon: 1,
    subMatchesLost: 2,
    subMatchDiff: -1,
    framesWon: 0,
    framesLost: 0,
    frameDiff: 0,
    awayWins: 0,
    points: 0,
    position: 2,
  },
];

describe("StandingsTable highlightEntrantId", () => {
  it("applies the highlight class to the matching row when supplied", () => {
    const names = new Map<string, string>([
      ["team-alpha", "Alpha"],
      ["team-bravo", "Bravo"],
    ]);
    const tree = StandingsTable({
      rows: ROWS,
      entrantNames: names,
      highlightEntrantId: "team-alpha",
    }) as ReactElement;
    const nodes = flatten(tree);
    const trs = nodes.filter(
      (n) => n.type === "tr" && typeof n.props?.className === "string"
    );
    const highlighted = trs.filter((n) =>
      String(n.props?.className).includes("bg-accent")
    );
    expect(highlighted).toHaveLength(1);
    // Matching row text contains "Alpha".
    const trText = JSON.stringify(highlighted[0]);
    expect(trText).toMatch(/Alpha/);
  });

  it("renders without highlight when prop is omitted", () => {
    const names = new Map<string, string>([
      ["team-alpha", "Alpha"],
      ["team-bravo", "Bravo"],
    ]);
    const tree = StandingsTable({
      rows: ROWS,
      entrantNames: names,
    }) as ReactElement;
    const nodes = flatten(tree);
    const trs = nodes.filter(
      (n) => n.type === "tr" && typeof n.props?.className === "string"
    );
    const highlighted = trs.filter((n) =>
      String(n.props?.className).includes("bg-accent")
    );
    expect(highlighted).toHaveLength(0);
  });
});
