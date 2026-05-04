import { describe, it, expect } from "vitest";
import {
  generateRoundRobin,
  generateGalaPairings,
  type GeneratedFixture,
} from "@/competitions/lib/schedule";

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `t${i + 1}`);
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

function realFixtures(fixtures: GeneratedFixture[]): GeneratedFixture[] {
  return fixtures.filter((f) => !f.isBye);
}

function byes(fixtures: GeneratedFixture[]): GeneratedFixture[] {
  return fixtures.filter((f) => f.isBye);
}

function rounds(fixtures: GeneratedFixture[]): Map<number, GeneratedFixture[]> {
  const out = new Map<number, GeneratedFixture[]>();
  for (const f of fixtures) {
    const arr = out.get(f.roundNumber) ?? [];
    arr.push(f);
    out.set(f.roundNumber, arr);
  }
  return out;
}

describe("generateRoundRobin — degenerate inputs", () => {
  it("0 teams returns empty", () => {
    expect(generateRoundRobin({ teamIds: [], rounds: 1 })).toEqual([]);
  });

  it("1 team returns empty", () => {
    expect(generateRoundRobin({ teamIds: ["solo"], rounds: 1 })).toEqual([]);
  });
});

describe("generateRoundRobin — small even N", () => {
  it("2 teams single → 1 fixture in 1 round", () => {
    const out = generateRoundRobin({ teamIds: ids(2), rounds: 1 });
    expect(out).toHaveLength(1);
    expect(out[0]!.roundNumber).toBe(1);
    expect(out[0]!.isBye).toBe(false);
    expect(out[0]!.homeTeamId).toBe("t1");
    expect(out[0]!.awayTeamId).toBe("t2");
  });

  it("2 teams double → 2 fixtures with venues swapped", () => {
    const out = generateRoundRobin({ teamIds: ids(2), rounds: 2 });
    expect(out).toHaveLength(2);
    expect(out[0]!.homeTeamId).toBe("t1");
    expect(out[0]!.awayTeamId).toBe("t2");
    expect(out[1]!.homeTeamId).toBe("t2");
    expect(out[1]!.awayTeamId).toBe("t1");
    expect(out[1]!.roundNumber).toBe(2);
  });

  it("4 teams single → 6 real fixtures over 3 rounds, no byes", () => {
    const out = generateRoundRobin({ teamIds: ids(4), rounds: 1 });
    expect(realFixtures(out)).toHaveLength(6);
    expect(byes(out)).toHaveLength(0);
    const rs = rounds(out);
    expect(rs.size).toBe(3);
    for (const [, list] of rs) expect(list).toHaveLength(2);
  });

  it("4 teams double → 12 real fixtures over 6 rounds", () => {
    const out = generateRoundRobin({ teamIds: ids(4), rounds: 2 });
    expect(realFixtures(out)).toHaveLength(12);
    expect(byes(out)).toHaveLength(0);
    const rs = rounds(out);
    expect(rs.size).toBe(6);
  });

  it("6 teams single → 15 real fixtures over 5 rounds, 3 per round", () => {
    const out = generateRoundRobin({ teamIds: ids(6), rounds: 1 });
    expect(realFixtures(out)).toHaveLength(15);
    expect(byes(out)).toHaveLength(0);
    const rs = rounds(out);
    expect(rs.size).toBe(5);
    for (const [, list] of rs) expect(list).toHaveLength(3);
  });

  it("6 teams double → 30 real fixtures over 10 rounds", () => {
    const out = generateRoundRobin({ teamIds: ids(6), rounds: 2 });
    expect(realFixtures(out)).toHaveLength(30);
    expect(rounds(out).size).toBe(10);
  });
});

describe("generateRoundRobin — odd N (byes)", () => {
  it("3 teams single → 3 real + 3 bye entries over 3 rounds, 1 bye per round", () => {
    const out = generateRoundRobin({ teamIds: ids(3), rounds: 1 });
    expect(realFixtures(out)).toHaveLength(3);
    expect(byes(out)).toHaveLength(3);
    const rs = rounds(out);
    expect(rs.size).toBe(3);
    for (const [, list] of rs) {
      expect(list.filter((f) => f.isBye)).toHaveLength(1);
    }
  });

  it("5 teams single → 10 real fixtures over 5 rounds, 1 bye per round", () => {
    const out = generateRoundRobin({ teamIds: ids(5), rounds: 1 });
    expect(realFixtures(out)).toHaveLength(10);
    expect(byes(out)).toHaveLength(5);
    const rs = rounds(out);
    expect(rs.size).toBe(5);
    for (const [, list] of rs) {
      expect(list.filter((f) => f.isBye)).toHaveLength(1);
      expect(list.filter((f) => !f.isBye)).toHaveLength(2);
    }
  });

  it("odd N — every team gets exactly one bye per single cycle (consistency: byeTeamId matches the team missing from real fixtures)", () => {
    const teams = ids(5);
    const out = generateRoundRobin({ teamIds: teams, rounds: 1 });
    const byeRecipients = new Map<string, number>(teams.map((t) => [t, 0]));
    const rs = rounds(out);
    for (const [, list] of rs) {
      const playing = new Set<string>();
      for (const fx of list) {
        if (!fx.isBye) {
          playing.add(fx.homeTeamId!);
          playing.add(fx.awayTeamId!);
        }
      }
      const sitting = teams.filter((t) => !playing.has(t));
      expect(sitting).toHaveLength(1);
      const byeFx = list.find((f) => f.isBye)!;
      expect(byeFx.byeTeamId).toBe(sitting[0]!);
      byeRecipients.set(sitting[0]!, byeRecipients.get(sitting[0]!)! + 1);
    }
    for (const t of teams) {
      expect(byeRecipients.get(t)).toBe(1);
    }
  });

  it("odd N — bye recipients are recorded directly on the fixture", () => {
    const teams = ids(5);
    const out = generateRoundRobin({ teamIds: teams, rounds: 1 });
    const byeCounts = new Map<string, number>(teams.map((t) => [t, 0]));
    for (const fx of byes(out)) {
      expect(fx.byeTeamId).not.toBeNull();
      byeCounts.set(fx.byeTeamId!, (byeCounts.get(fx.byeTeamId!) ?? 0) + 1);
    }
    for (const t of teams) expect(byeCounts.get(t)).toBe(1);
  });

  it("non-bye fixtures have byeTeamId null", () => {
    const out = generateRoundRobin({ teamIds: ids(5), rounds: 1 });
    for (const fx of realFixtures(out)) expect(fx.byeTeamId).toBeNull();
  });

  it("double RR with odd N — every team gets exactly two byes", () => {
    const teams = ids(5);
    const out = generateRoundRobin({ teamIds: teams, rounds: 2 });
    const byeCounts = new Map<string, number>(teams.map((t) => [t, 0]));
    for (const fx of byes(out)) {
      expect(fx.byeTeamId).not.toBeNull();
      byeCounts.set(fx.byeTeamId!, (byeCounts.get(fx.byeTeamId!) ?? 0) + 1);
    }
    for (const t of teams) expect(byeCounts.get(t)).toBe(2);
  });
});

describe("generateRoundRobin — pairing invariants", () => {
  it("every pair plays exactly once in single RR (varied N)", () => {
    for (const n of [2, 3, 4, 5, 6, 7, 8]) {
      const out = generateRoundRobin({ teamIds: ids(n), rounds: 1 });
      const counts = new Map<string, number>();
      for (const fx of realFixtures(out)) {
        const k = pairKey(fx.homeTeamId!, fx.awayTeamId!);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const expected = (n * (n - 1)) / 2;
      expect(counts.size, `N=${n}`).toBe(expected);
      for (const [, c] of counts) expect(c).toBe(1);
    }
  });

  it("every pair plays exactly twice in double RR (varied N)", () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const out = generateRoundRobin({ teamIds: ids(n), rounds: 2 });
      const counts = new Map<string, number>();
      for (const fx of realFixtures(out)) {
        const k = pairKey(fx.homeTeamId!, fx.awayTeamId!);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const expected = (n * (n - 1)) / 2;
      expect(counts.size, `N=${n}`).toBe(expected);
      for (const [, c] of counts) expect(c).toBe(2);
    }
  });

  it("no team appears more than once in any round", () => {
    for (const n of [3, 4, 5, 6, 7, 8]) {
      const out = generateRoundRobin({ teamIds: ids(n), rounds: 1 });
      const rs = rounds(out);
      for (const [round, list] of rs) {
        const seen = new Set<string>();
        for (const fx of list) {
          if (fx.isBye) continue;
          expect(
            seen.has(fx.homeTeamId!),
            `N=${n} round=${round}`
          ).toBe(false);
          seen.add(fx.homeTeamId!);
          expect(seen.has(fx.awayTeamId!)).toBe(false);
          seen.add(fx.awayTeamId!);
        }
      }
    }
  });
});

describe("generateRoundRobin — home/away balance", () => {
  it("even N single RR: each team plays N/2 or N/2-1 home games", () => {
    for (const n of [4, 6, 8]) {
      const out = generateRoundRobin({ teamIds: ids(n), rounds: 1 });
      const homeCount = new Map<string, number>();
      for (const fx of realFixtures(out)) {
        homeCount.set(
          fx.homeTeamId!,
          (homeCount.get(fx.homeTeamId!) ?? 0) + 1
        );
      }
      for (const t of ids(n)) {
        const h = homeCount.get(t) ?? 0;
        expect([n / 2, n / 2 - 1], `N=${n} team=${t} home=${h}`).toContain(h);
      }
    }
  });

  it("even N double RR: every team has exact home/away balance", () => {
    for (const n of [4, 6]) {
      const out = generateRoundRobin({ teamIds: ids(n), rounds: 2 });
      const homeCount = new Map<string, number>();
      const awayCount = new Map<string, number>();
      for (const fx of realFixtures(out)) {
        homeCount.set(fx.homeTeamId!, (homeCount.get(fx.homeTeamId!) ?? 0) + 1);
        awayCount.set(fx.awayTeamId!, (awayCount.get(fx.awayTeamId!) ?? 0) + 1);
      }
      for (const t of ids(n)) {
        expect(homeCount.get(t)).toBe(awayCount.get(t));
      }
    }
  });

  it("double RR mirrors venues: each pairing played once at each venue", () => {
    const out = generateRoundRobin({ teamIds: ids(4), rounds: 2 });
    const venueCounts = new Map<string, { home: Set<string>; away: Set<string> }>();
    for (const fx of realFixtures(out)) {
      const k = pairKey(fx.homeTeamId!, fx.awayTeamId!);
      const entry =
        venueCounts.get(k) ?? { home: new Set<string>(), away: new Set<string>() };
      entry.home.add(fx.homeTeamId!);
      entry.away.add(fx.awayTeamId!);
      venueCounts.set(k, entry);
    }
    for (const [, entry] of venueCounts) {
      // Both teams hosted exactly once (set sizes 2 each).
      expect(entry.home.size).toBe(2);
      expect(entry.away.size).toBe(2);
    }
  });
});

describe("generateRoundRobin — date stamping", () => {
  it("startDate + weekly cadence produces 7-day spacing per round", () => {
    const out = generateRoundRobin({
      teamIds: ids(4),
      rounds: 1,
      startDate: "2026-01-01",
      cadence: { unit: "week", value: 1 },
    });
    const r1 = out.find((f) => f.roundNumber === 1)!;
    const r2 = out.find((f) => f.roundNumber === 2)!;
    const r3 = out.find((f) => f.roundNumber === 3)!;
    expect(r1.scheduledAt).toBe("2026-01-01T00:00:00.000Z");
    expect(r2.scheduledAt).toBe("2026-01-08T00:00:00.000Z");
    expect(r3.scheduledAt).toBe("2026-01-15T00:00:00.000Z");
  });

  it("no cadence → all scheduledAt are null", () => {
    const out = generateRoundRobin({ teamIds: ids(4), rounds: 1 });
    for (const fx of out) expect(fx.scheduledAt).toBeNull();
  });

  it("cadence without startDate throws", () => {
    expect(() =>
      generateRoundRobin({
        teamIds: ids(4),
        rounds: 1,
        cadence: { unit: "week", value: 1 },
      })
    ).toThrow(/startDate/);
  });
});

describe("generateRoundRobin — input fidelity", () => {
  it("preserves teamId identity (no reordering surprise)", () => {
    const teamIds = [
      "uuid-charlie",
      "uuid-alpha",
      "uuid-zulu",
      "uuid-mike",
    ];
    const out = generateRoundRobin({ teamIds, rounds: 1 });
    const seen = new Set<string>();
    for (const fx of realFixtures(out)) {
      seen.add(fx.homeTeamId!);
      seen.add(fx.awayTeamId!);
    }
    for (const t of teamIds) expect(seen.has(t)).toBe(true);
  });

  it("identical input produces identical output (determinism)", () => {
    const a = generateRoundRobin({ teamIds: ids(5), rounds: 2 });
    const b = generateRoundRobin({ teamIds: ids(5), rounds: 2 });
    expect(a).toEqual(b);
  });

  it("round numbers are 1-indexed and contiguous", () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const out = generateRoundRobin({ teamIds: ids(n), rounds: 2 });
      const rounded = Array.from(rounds(out).keys()).sort((a, b) => a - b);
      const expected = n % 2 === 0 ? (n - 1) * 2 : n * 2;
      expect(rounded[0], `N=${n}`).toBe(1);
      expect(rounded[rounded.length - 1]).toBe(expected);
      for (let i = 1; i < rounded.length; i++) {
        expect(rounded[i]! - rounded[i - 1]!).toBe(1);
      }
    }
  });
});

describe("generateGalaPairings", () => {
  it("2 participants → 1 pairing", () => {
    const out = generateGalaPairings(["a", "b"]);
    expect(out).toEqual([
      { homeTeamId: "a", awayTeamId: "b", pairingOrder: 1 },
    ]);
  });

  it("4 participants → 6 pairings", () => {
    const out = generateGalaPairings(["a", "b", "c", "d"]);
    expect(out).toHaveLength(6);
    expect(out.map((p) => p.pairingOrder)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("6 participants → 15 pairings, all unique", () => {
    const teams = ["a", "b", "c", "d", "e", "f"];
    const out = generateGalaPairings(teams);
    expect(out).toHaveLength(15);
    const keys = new Set(out.map((p) => pairKey(p.homeTeamId, p.awayTeamId)));
    expect(keys.size).toBe(15);
  });
});
