// =============================================================================
// Bracket — single-elim viewer (Session 22)
// =============================================================================
// Server-rendered bracket that lays out every match round-by-round. Uses a
// CSS grid with column-per-round on desktop, stacks to a single column on
// mobile with round headers. Each match shows entrant names + scores; a
// client child ("ReportResultButton") surfaces the modal for members who
// are participants in a scheduled match.
// =============================================================================

import { Trophy } from "lucide-react";
import type {
  EnrichedEntrant,
  Match,
  MatchResult,
} from "../types";
import { ReportResultButton } from "./ReportResultButton";

export interface BracketProps {
  matches: Match[];
  entrants: EnrichedEntrant[];
  results: MatchResult[];
  /**
   * Entrant id of the current viewer (only set for members registered in
   * this competition). When set, a match the viewer is in gets a
   * "Report result" button.
   */
  currentEntrantId?: string | null;
  /**
   * When true, surfaces manager-only override / clear controls on each
   * match card. The actual action wiring lives one level up — this flag
   * is just a rendering switch.
   */
  showManagerControls?: boolean;
}

export function Bracket({
  matches,
  entrants,
  results,
  currentEntrantId = null,
  showManagerControls = false,
}: BracketProps) {
  const entrantMap = new Map(entrants.map((e) => [e.entrant.id, e]));
  const resultMap = new Map(results.map((r) => [r.match_id, r]));

  // Group by round.
  const rounds = new Map<number, Match[]>();
  let maxRound = 0;
  for (const m of matches) {
    if (m.round_number === null) continue;
    const list = rounds.get(m.round_number) ?? [];
    list.push(m);
    rounds.set(m.round_number, list);
    if (m.round_number > maxRound) maxRound = m.round_number;
  }
  for (const [, list] of rounds) {
    list.sort(
      (a, b) => (a.bracket_position ?? 0) - (b.bracket_position ?? 0)
    );
  }

  if (matches.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 bg-surface-1/50 p-6 text-center text-xs text-white/50">
        Bracket hasn&apos;t been published yet.
      </div>
    );
  }

  const finalMatch = rounds.get(maxRound)?.[0];
  const finalResult = finalMatch ? resultMap.get(finalMatch.id) : null;
  const champion = finalResult
    ? entrantMap.get(finalResult.winner_entrant_id) ?? null
    : null;

  return (
    <div className="space-y-6">
      {champion && (
        <div
          className="flex items-center gap-3 rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-3"
          data-testid="bracket-champion"
        >
          <Trophy
            size={20}
            strokeWidth={1.5}
            className="text-yellow-400"
            fill="currentColor"
          />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-yellow-400/70">
              Champion
            </div>
            <div className="text-sm font-semibold text-white">
              {entrantLabel(champion)}
            </div>
          </div>
        </div>
      )}

      <div
        className="grid gap-4 overflow-x-auto pb-2 md:gap-6"
        style={{
          gridTemplateColumns: `repeat(${maxRound}, minmax(240px, 1fr))`,
        }}
      >
        {Array.from({ length: maxRound }, (_, i) => i + 1).map((round) => {
          const list = rounds.get(round) ?? [];
          return (
            <div key={round} className="space-y-3">
              <div className="text-[10px] uppercase tracking-wider text-white/40">
                {roundLabel(round, maxRound)}
              </div>
              {list.map((m) => {
                const result = resultMap.get(m.id) ?? null;
                return (
                  <MatchCard
                    key={m.id}
                    match={m}
                    result={result}
                    entrantMap={entrantMap}
                    currentEntrantId={currentEntrantId}
                    showManagerControls={showManagerControls}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function roundLabel(round: number, maxRound: number): string {
  if (round === maxRound) return "Final";
  if (round === maxRound - 1) return "Semi-finals";
  if (round === maxRound - 2) return "Quarter-finals";
  return `Round ${round}`;
}

function entrantLabel(e: EnrichedEntrant | null): string {
  if (!e || !e.subject) return "TBD";
  if (e.subject.kind === "player") return e.subject.player.displayName;
  return e.subject.team.name;
}

interface MatchCardProps {
  match: Match;
  result: MatchResult | null;
  entrantMap: Map<string, EnrichedEntrant>;
  currentEntrantId: string | null;
  showManagerControls: boolean;
}

function MatchCard({
  match,
  result,
  entrantMap,
  currentEntrantId,
  showManagerControls,
}: MatchCardProps) {
  const entA = match.entrant_a_id ? entrantMap.get(match.entrant_a_id) ?? null : null;
  const entB = match.entrant_b_id ? entrantMap.get(match.entrant_b_id) ?? null : null;
  const winnerId = result?.winner_entrant_id ?? null;

  const viewerIsParticipant =
    currentEntrantId !== null &&
    (match.entrant_a_id === currentEntrantId ||
      match.entrant_b_id === currentEntrantId);
  const canReport =
    viewerIsParticipant &&
    match.status === "scheduled" &&
    match.entrant_a_id !== null &&
    match.entrant_b_id !== null;

  const border = match.is_walkover
    ? "border-white/10 bg-surface-1/30 opacity-60"
    : match.status === "completed"
      ? "border-white/15 bg-surface-1/90"
      : "border-white/10 bg-surface-1/70";

  return (
    <div
      className={`rounded-xl border px-3 py-2 text-xs ${border}`}
      data-testid={`match-${match.round_number}-${match.bracket_position}`}
    >
      <div className="mb-1 flex items-center justify-between text-[10px] text-white/40">
        <span>
          {match.round_number !== null
            ? `R${match.round_number}`
            : "Match"}
          {match.bracket_position !== null
            ? ` · M${match.bracket_position}`
            : ""}
        </span>
        {match.is_walkover ? (
          <span className="text-white/50">Walkover</span>
        ) : (
          <span className="uppercase tracking-wider">
            {match.status.replace(/_/g, " ")}
          </span>
        )}
      </div>

      <SlotRow
        entrant={entA}
        score={result?.score_a ?? null}
        isWinner={winnerId !== null && winnerId === match.entrant_a_id}
        raceTo={match.race_to_a}
      />
      <div className="my-1 border-t border-white/5" />
      <SlotRow
        entrant={entB}
        score={result?.score_b ?? null}
        isWinner={winnerId !== null && winnerId === match.entrant_b_id}
        raceTo={match.race_to_b}
      />

      {canReport && (
        <div className="mt-2">
          <ReportResultButton
            matchId={match.id}
            entrantAId={match.entrant_a_id!}
            entrantBId={match.entrant_b_id!}
            entrantAName={entrantLabel(entA)}
            entrantBName={entrantLabel(entB)}
            currentEntrantId={currentEntrantId!}
            raceToA={match.race_to_a}
            raceToB={match.race_to_b}
          />
        </div>
      )}

      {showManagerControls &&
        match.entrant_a_id !== null &&
        match.entrant_b_id !== null && (
          <div className="mt-2 flex gap-2 text-[10px]">
            <ReportResultButton
              matchId={match.id}
              entrantAId={match.entrant_a_id}
              entrantBId={match.entrant_b_id}
              entrantAName={entrantLabel(entA)}
              entrantBName={entrantLabel(entB)}
              currentEntrantId={null}
              managerOverride
              hasExistingResult={result !== null}
              raceToA={match.race_to_a}
              raceToB={match.race_to_b}
            />
          </div>
        )}
    </div>
  );
}

interface SlotRowProps {
  entrant: EnrichedEntrant | null;
  score: number | null;
  isWinner: boolean;
  raceTo: number;
}

function SlotRow({ entrant, score, isWinner, raceTo }: SlotRowProps) {
  const label = entrant ? entrantLabel(entrant) : "TBD";
  const seed = entrant?.entrant.seed_number ?? null;

  return (
    <div
      className={`flex items-center justify-between gap-3 ${
        isWinner ? "font-semibold text-white" : "text-white/70"
      }`}
    >
      <span className="flex items-center gap-2 truncate">
        {seed !== null && (
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/10 bg-surface-2 text-[9px] text-white/50">
            {seed}
          </span>
        )}
        <span className="truncate">{label}</span>
      </span>
      <span
        className={`shrink-0 text-[11px] tabular-nums ${
          isWinner ? "text-white" : "text-white/40"
        }`}
      >
        {score !== null ? score : `—/${raceTo}`}
      </span>
    </div>
  );
}
