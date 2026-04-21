// =============================================================================
// Competitions — single-elim bracket generation (Session 22)
// =============================================================================
// Pure function. No DB, no React, no side effects. Takes a seeded list of
// entrants, returns one spec per match with feed-into pointers describing
// which downstream match each winner flows into.
//
// The caller (persistBracket) maps these specs onto DB rows — this file only
// knows about seeds, rounds, and bracket positions.
// =============================================================================

export interface SeededEntrant {
  entrantId: string;
  /** 1 = top seed; seeds must be contiguous 1..N. */
  seedNumber: number;
}

export type BracketSlot =
  | { entrantId: string }
  | { kind: "bye" };

export interface BracketMatchSpec {
  roundNumber: number;
  bracketPosition: number;
  entrantA: BracketSlot;
  entrantB: BracketSlot;
  /** Round/position of the match this winner feeds into. Null for the final. */
  feedsInto: { roundNumber: number; bracketPosition: number } | null;
  /** Which slot of feedsInto this winner fills. Null for the final. */
  feedsIntoSlot: "a" | "b" | null;
}

/**
 * Generate specs for every match in a single-elim bracket. Round 1 contains
 * real entrants plus byes; rounds 2..R are placeholders (both slots are
 * `{ kind: "bye" }`) that the caller persists with NULL entrant columns.
 * Auto-advance later UPDATEs the slots as feeders complete.
 */
export function generateSingleElimBracket(
  seeded: SeededEntrant[]
): BracketMatchSpec[] {
  if (seeded.length < 2) {
    throw new Error("Bracket requires at least 2 entrants");
  }

  // Validate seeds: contiguous 1..N, no duplicates.
  const seedNumbers = seeded.map((s) => s.seedNumber).sort((a, b) => a - b);
  for (let i = 0; i < seedNumbers.length; i++) {
    if (seedNumbers[i] !== i + 1) {
      if (i > 0 && seedNumbers[i] === seedNumbers[i - 1]) {
        throw new Error(`Duplicate seed number: ${seedNumbers[i]}`);
      }
      throw new Error(
        `Seeds must be contiguous 1..${seeded.length} (got ${seedNumbers.join(", ")})`
      );
    }
  }

  const bySeed = new Map<number, string>();
  for (const s of seeded) bySeed.set(s.seedNumber, s.entrantId);

  const n = seeded.length;
  const rounds = Math.ceil(Math.log2(n));
  const bracketSize = 1 << rounds; // 2^rounds

  // Standard seeding: compute the order of seeds top-to-bottom in round 1.
  // For a 16-bracket this produces: [1,16,8,9,5,12,4,13,6,11,3,14,7,10,2,15]
  const seedOrder = buildSeedOrder(bracketSize);

  const specs: BracketMatchSpec[] = [];

  // Round 1: bracketSize/2 matches. Each match pairs two adjacent positions
  // in seedOrder. Seeds > n become byes.
  const r1MatchCount = bracketSize / 2;
  for (let pos = 1; pos <= r1MatchCount; pos++) {
    const seedA = seedOrder[(pos - 1) * 2];
    const seedB = seedOrder[(pos - 1) * 2 + 1];
    const slotA: BracketSlot =
      seedA <= n ? { entrantId: bySeed.get(seedA)! } : { kind: "bye" };
    const slotB: BracketSlot =
      seedB <= n ? { entrantId: bySeed.get(seedB)! } : { kind: "bye" };

    specs.push({
      roundNumber: 1,
      bracketPosition: pos,
      entrantA: slotA,
      entrantB: slotB,
      feedsInto:
        rounds >= 2
          ? { roundNumber: 2, bracketPosition: Math.ceil(pos / 2) }
          : null,
      feedsIntoSlot: rounds >= 2 ? (pos % 2 === 1 ? "a" : "b") : null,
    });
  }

  // Rounds 2..R: placeholders with both slots empty.
  for (let r = 2; r <= rounds; r++) {
    const matchCount = bracketSize / (1 << r);
    for (let pos = 1; pos <= matchCount; pos++) {
      const isFinal = r === rounds;
      specs.push({
        roundNumber: r,
        bracketPosition: pos,
        entrantA: { kind: "bye" },
        entrantB: { kind: "bye" },
        feedsInto: isFinal
          ? null
          : { roundNumber: r + 1, bracketPosition: Math.ceil(pos / 2) },
        feedsIntoSlot: isFinal ? null : pos % 2 === 1 ? "a" : "b",
      });
    }
  }

  return specs;
}

/**
 * Standard tournament seeding order. For size 2: [1, 2]. Size 4: [1, 4, 2, 3].
 * Size 8: [1, 8, 4, 5, 2, 7, 3, 6]. Size 16: [1, 16, 8, 9, 4, 13, 5, 12, 2,
 * 15, 7, 10, 3, 14, 6, 11]. Built by recursive top-down split: for a bracket
 * of size 2k, interleave the size-k order by pairing each seed `s` with its
 * complement `2k+1-s`. Produces the canonical QF/SF/F tree (1v8, 4v5, 2v7,
 * 3v6 in QFs; 1v4, 2v3 in SFs; 1v2 in the final).
 */
function buildSeedOrder(size: number): number[] {
  if (size === 1) return [1];
  if (size === 2) return [1, 2];

  const half = buildSeedOrder(size / 2);
  const result: number[] = [];
  for (const seed of half) {
    result.push(seed);
    result.push(size + 1 - seed);
  }
  return result;
}
