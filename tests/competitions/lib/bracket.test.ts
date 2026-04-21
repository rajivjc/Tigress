import { describe, it, expect } from "vitest";
import { generateSingleElimBracket } from "@/competitions/lib/bracket";
import type {
  BracketMatchSpec,
  SeededEntrant,
} from "@/competitions/lib/bracket";

function seeded(n: number): SeededEntrant[] {
  return Array.from({ length: n }, (_, i) => ({
    entrantId: `e${i + 1}`,
    seedNumber: i + 1,
  }));
}

function r1(specs: BracketMatchSpec[]) {
  return specs.filter((s) => s.roundNumber === 1);
}

function byRound(specs: BracketMatchSpec[]) {
  const out = new Map<number, BracketMatchSpec[]>();
  for (const s of specs) {
    const arr = out.get(s.roundNumber) ?? [];
    arr.push(s);
    out.set(s.roundNumber, arr);
  }
  return out;
}

function slotId(slot: BracketMatchSpec["entrantA"]): string | null {
  return "entrantId" in slot ? slot.entrantId : null;
}

function pairIds(s: BracketMatchSpec): [string | null, string | null] {
  return [slotId(s.entrantA), slotId(s.entrantB)];
}

describe("generateSingleElimBracket — match and round counts", () => {
  it("N=2: 1 match, 1 round", () => {
    const specs = generateSingleElimBracket(seeded(2));
    expect(specs).toHaveLength(1);
    const rounds = byRound(specs);
    expect(rounds.size).toBe(1);
    expect(rounds.get(1)).toHaveLength(1);
  });

  it("N=3: 3 matches, 2 rounds (pad to 4)", () => {
    const specs = generateSingleElimBracket(seeded(3));
    expect(specs).toHaveLength(3);
    const rounds = byRound(specs);
    expect(rounds.get(1)).toHaveLength(2);
    expect(rounds.get(2)).toHaveLength(1);
  });

  it("N=4: 3 matches, 2 rounds", () => {
    const specs = generateSingleElimBracket(seeded(4));
    expect(specs).toHaveLength(3);
    expect(byRound(specs).get(1)).toHaveLength(2);
  });

  it("N=5: 7 matches, 3 rounds (pad to 8)", () => {
    const specs = generateSingleElimBracket(seeded(5));
    expect(specs).toHaveLength(7);
    expect(byRound(specs).get(1)).toHaveLength(4);
    expect(byRound(specs).get(3)).toHaveLength(1);
  });

  it("N=6: 7 matches, 3 rounds", () => {
    const specs = generateSingleElimBracket(seeded(6));
    expect(specs).toHaveLength(7);
  });

  it("N=7: 7 matches, 3 rounds (one bye)", () => {
    const specs = generateSingleElimBracket(seeded(7));
    expect(specs).toHaveLength(7);
  });

  it("N=8: 7 matches, 3 rounds, no byes", () => {
    const specs = generateSingleElimBracket(seeded(8));
    expect(specs).toHaveLength(7);
    for (const s of r1(specs)) {
      expect("entrantId" in s.entrantA).toBe(true);
      expect("entrantId" in s.entrantB).toBe(true);
    }
  });

  it("N=16: 15 matches, 4 rounds, no byes", () => {
    const specs = generateSingleElimBracket(seeded(16));
    expect(specs).toHaveLength(15);
    expect(byRound(specs).get(1)).toHaveLength(8);
    expect(byRound(specs).get(4)).toHaveLength(1);
    for (const s of r1(specs)) {
      expect("entrantId" in s.entrantA).toBe(true);
      expect("entrantId" in s.entrantB).toBe(true);
    }
  });
});

describe("generateSingleElimBracket — bye placement", () => {
  it("N=3: bye goes to seed 2 (bottom-half of a 4-bracket)", () => {
    const specs = generateSingleElimBracket(seeded(3));
    const round1 = r1(specs);
    const byeMatch = round1.find(
      (s) => !("entrantId" in s.entrantA) || !("entrantId" in s.entrantB)
    );
    expect(byeMatch).toBeDefined();
    const ids = pairIds(byeMatch!);
    // Non-bye slot should be a real entrant id
    const real = ids.filter((x): x is string => x !== null);
    expect(real).toHaveLength(1);
  });

  it("N=5: three byes go to top 3 seeds", () => {
    const specs = generateSingleElimBracket(seeded(5));
    const round1 = r1(specs);
    const byeOpponents = new Set<string>();
    for (const s of round1) {
      const a = slotId(s.entrantA);
      const b = slotId(s.entrantB);
      if (a && !b) byeOpponents.add(a);
      if (b && !a) byeOpponents.add(b);
    }
    expect(byeOpponents).toEqual(new Set(["e1", "e2", "e3"]));
  });

  it("N=7: one bye goes to seed 1", () => {
    const specs = generateSingleElimBracket(seeded(7));
    const round1 = r1(specs);
    const byeOpponents = new Set<string>();
    for (const s of round1) {
      const a = slotId(s.entrantA);
      const b = slotId(s.entrantB);
      if (a && !b) byeOpponents.add(a);
      if (b && !a) byeOpponents.add(b);
    }
    expect(byeOpponents).toEqual(new Set(["e1"]));
  });
});

describe("generateSingleElimBracket — seeding pattern", () => {
  it("N=8: matches include 1v8, 4v5, 3v6, 2v7", () => {
    const specs = generateSingleElimBracket(seeded(8));
    const pairs = r1(specs).map(pairIds);
    const pairSets = pairs.map((p) => new Set(p));
    const expected: Set<string | null>[] = [
      new Set(["e1", "e8"]),
      new Set(["e4", "e5"]),
      new Set(["e3", "e6"]),
      new Set(["e2", "e7"]),
    ];
    for (const e of expected) {
      expect(pairSets.some((p) => eqSet(p, e))).toBe(true);
    }
  });

  it("N=4: seed 1 plays seed 4, seed 2 plays seed 3", () => {
    const specs = generateSingleElimBracket(seeded(4));
    const pairs = r1(specs).map(pairIds).map((p) => new Set(p));
    expect(pairs.some((p) => eqSet(p, new Set(["e1", "e4"])))).toBe(true);
    expect(pairs.some((p) => eqSet(p, new Set(["e2", "e3"])))).toBe(true);
  });

  it("top seed is always in match 1 of round 1", () => {
    for (const n of [2, 3, 4, 5, 6, 7, 8, 16]) {
      const specs = generateSingleElimBracket(seeded(n));
      const m1 = r1(specs).find((s) => s.bracketPosition === 1)!;
      const ids = pairIds(m1);
      expect(ids.includes("e1")).toBe(true);
    }
  });
});

describe("generateSingleElimBracket — feedsInto pointers", () => {
  it("final has feedsInto: null", () => {
    const specs = generateSingleElimBracket(seeded(8));
    const final = specs[specs.length - 1];
    expect(final.feedsInto).toBeNull();
    expect(final.feedsIntoSlot).toBeNull();
  });

  it("N=2: single match has null feedsInto", () => {
    const specs = generateSingleElimBracket(seeded(2));
    expect(specs[0].feedsInto).toBeNull();
    expect(specs[0].feedsIntoSlot).toBeNull();
  });

  it("round N position P feeds into round N+1 position ceil(P/2)", () => {
    const specs = generateSingleElimBracket(seeded(16));
    for (const s of specs) {
      if (s.feedsInto === null) continue;
      expect(s.feedsInto.roundNumber).toBe(s.roundNumber + 1);
      expect(s.feedsInto.bracketPosition).toBe(Math.ceil(s.bracketPosition / 2));
    }
  });

  it("feedsIntoSlot alternates a/b by odd/even bracket position", () => {
    const specs = generateSingleElimBracket(seeded(8));
    for (const s of specs) {
      if (s.feedsIntoSlot === null) continue;
      const expected = s.bracketPosition % 2 === 1 ? "a" : "b";
      expect(s.feedsIntoSlot).toBe(expected);
    }
  });

  it("every match except the final has a feedsInto target that exists", () => {
    const specs = generateSingleElimBracket(seeded(16));
    const positions = new Set(
      specs.map((s) => `${s.roundNumber}:${s.bracketPosition}`)
    );
    for (const s of specs) {
      if (!s.feedsInto) continue;
      const key = `${s.feedsInto.roundNumber}:${s.feedsInto.bracketPosition}`;
      expect(positions.has(key)).toBe(true);
    }
  });
});

describe("generateSingleElimBracket — validation", () => {
  it("rejects N=0", () => {
    expect(() => generateSingleElimBracket([])).toThrow(/at least 2/);
  });

  it("rejects N=1", () => {
    expect(() =>
      generateSingleElimBracket([{ entrantId: "e1", seedNumber: 1 }])
    ).toThrow(/at least 2/);
  });

  it("rejects duplicate seed numbers", () => {
    expect(() =>
      generateSingleElimBracket([
        { entrantId: "e1", seedNumber: 1 },
        { entrantId: "e2", seedNumber: 1 },
      ])
    ).toThrow(/[Dd]uplicate/);
  });

  it("rejects non-contiguous seeds (1,2,5)", () => {
    expect(() =>
      generateSingleElimBracket([
        { entrantId: "e1", seedNumber: 1 },
        { entrantId: "e2", seedNumber: 2 },
        { entrantId: "e5", seedNumber: 5 },
      ])
    ).toThrow(/contiguous/);
  });
});

function eqSet(a: Set<string | null>, b: Set<string | null>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
