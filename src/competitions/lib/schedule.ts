// =============================================================================
// Competitions — round-robin schedule generator (Session 24a)
// =============================================================================
// Pure function. No DB, no React, no I/O. Takes a list of team ids and
// returns one GeneratedFixture per match using the circle method (Berger
// tables).
//
//   - Even N: N-1 rounds, every team plays exactly once per round.
//   - Odd N:  the bracket is solved as if N+1 teams were present with a
//             phantom "bye" placeholder in the last slot; the matchup
//             involving the phantom becomes a bye fixture for the real team.
//             N rounds, every team gets exactly one bye per single cycle.
//
// Home/away balance:
//   - The fixed team (index 0) alternates per round (R1 home, R2 away, ...).
//   - Other pairings host from the upper half of the rotation array, which
//     yields ⌈(M-1)/2⌉ home / ⌊(M-1)/2⌋ away over a single RR. A double RR
//     mirrors the venue of every fixture in the second half so balance is
//     exact.
//
// Determinism: no Math.random, no Date.now. Same input → same output.
// =============================================================================

export type ScheduleCadence = {
  unit: "day" | "week";
  value: number;
};

export type ScheduleOptions = {
  teamIds: string[];
  rounds: 1 | 2;
  /** ISO date (UTC). Required when `cadence` is provided. */
  startDate?: string;
  cadence?: ScheduleCadence;
};

export type GeneratedFixture = {
  /** 1-indexed, contiguous. */
  roundNumber: number;
  /** Null when this entry is a bye. */
  homeTeamId: string | null;
  /** Null when this entry is a bye. */
  awayTeamId: string | null;
  /** Set when isBye is true: the team that's sitting out this round. */
  byeTeamId: string | null;
  isBye: boolean;
  /** ISO date (UTC). Null when no cadence is supplied. */
  scheduledAt: string | null;
};

const PHANTOM = -1;

/**
 * Generate every fixture (and bye entry) for a single or double round-robin.
 * Returns an empty array when there are fewer than 2 teams.
 */
export function generateRoundRobin(opts: ScheduleOptions): GeneratedFixture[] {
  if (opts.cadence && !opts.startDate) {
    throw new Error("startDate is required when cadence is provided");
  }
  if (opts.rounds !== 1 && opts.rounds !== 2) {
    throw new Error("rounds must be 1 or 2");
  }

  const teams = opts.teamIds;
  const n = teams.length;
  if (n < 2) return [];

  // M is the rotation size: the next even number >= n. When n is odd we
  // append a phantom entry; the real team paired with it gets a bye.
  const m = n % 2 === 0 ? n : n + 1;
  const rotationSize = m - 1;
  const roundsPerCycle = m - 1;
  const pairsPerRound = m / 2;

  const phantomIndex = n % 2 === 0 ? PHANTOM : n;

  const out: GeneratedFixture[] = [];

  // First half (single round-robin).
  for (let r = 1; r <= roundsPerCycle; r++) {
    // Build the rotation array: arr[0] = 0 fixed; arr[k] for k>=1 rotates
    // clockwise, so in round r the team that started at slot s (1..M-1) sits
    // at slot ((s - 1 + r - 1) mod (M-1)) + 1.
    const arr: number[] = new Array(m);
    arr[0] = 0;
    for (let k = 1; k <= rotationSize; k++) {
      const original = (((k - r) % rotationSize) + rotationSize) % rotationSize;
      arr[k] = original + 1;
    }

    for (let i = 0; i < pairsPerRound; i++) {
      const aIdx = arr[i]!;
      const bIdx = arr[m - 1 - i]!;
      const aIsPhantom = aIdx === phantomIndex;
      const bIsPhantom = bIdx === phantomIndex;

      if (aIsPhantom || bIsPhantom) {
        // Bye fixture — the non-phantom slot identifies the team sitting out.
        const byeIdx = aIsPhantom ? bIdx : aIdx;
        out.push({
          roundNumber: r,
          homeTeamId: null,
          awayTeamId: null,
          byeTeamId: teams[byeIdx]!,
          isBye: true,
          scheduledAt: null,
        });
        continue;
      }

      let homeIdx: number;
      let awayIdx: number;
      if (i === 0) {
        // Fixed team alternates: odd round home, even round away.
        if (r % 2 === 1) {
          homeIdx = aIdx;
          awayIdx = bIdx;
        } else {
          homeIdx = bIdx;
          awayIdx = aIdx;
        }
      } else {
        // Upper-half hosts.
        homeIdx = aIdx;
        awayIdx = bIdx;
      }

      out.push({
        roundNumber: r,
        homeTeamId: teams[homeIdx]!,
        awayTeamId: teams[awayIdx]!,
        byeTeamId: null,
        isBye: false,
        scheduledAt: null,
      });
    }
  }

  // Second half — every fixture mirrored, venues swapped, contiguous round
  // numbers picking up where the first half left off.
  if (opts.rounds === 2) {
    const firstHalf = out.slice();
    for (const fx of firstHalf) {
      out.push({
        roundNumber: fx.roundNumber + roundsPerCycle,
        homeTeamId: fx.awayTeamId,
        awayTeamId: fx.homeTeamId,
        byeTeamId: fx.byeTeamId,
        isBye: fx.isBye,
        scheduledAt: null,
      });
    }
  }

  // Date stamping (after both halves so round numbering aligns).
  if (opts.cadence && opts.startDate) {
    const daysPerRound =
      opts.cadence.unit === "day"
        ? opts.cadence.value
        : opts.cadence.value * 7;
    if (!Number.isInteger(daysPerRound) || daysPerRound <= 0) {
      throw new Error("cadence value must be a positive integer");
    }
    const start = parseUtcDate(opts.startDate);
    for (const fx of out) {
      const offsetDays = (fx.roundNumber - 1) * daysPerRound;
      const stamped = new Date(start.getTime());
      stamped.setUTCDate(stamped.getUTCDate() + offsetDays);
      fx.scheduledAt = stamped.toISOString();
    }
  }

  return out;
}

/**
 * Pure helper for galas: every N-choose-2 unordered pairing in deterministic
 * order. The earlier team in the input array hosts. `pairing_order` is
 * 1-indexed and matches insertion order.
 */
export function generateGalaPairings(
  teamIds: string[]
): { homeTeamId: string; awayTeamId: string; pairingOrder: number }[] {
  if (teamIds.length < 2) return [];
  const out: { homeTeamId: string; awayTeamId: string; pairingOrder: number }[] = [];
  let order = 1;
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      out.push({
        homeTeamId: teamIds[i]!,
        awayTeamId: teamIds[j]!,
        pairingOrder: order++,
      });
    }
  }
  return out;
}

function parseUtcDate(iso: string): Date {
  // Treat date-only strings as UTC midnight; full ISO timestamps pass through.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return new Date(`${iso}T00:00:00.000Z`);
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid startDate: ${iso}`);
  }
  return d;
}
