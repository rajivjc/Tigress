import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCompetition } from "@/competitions/data/competitions";
import { getFixture, getFixturesEnriched } from "@/competitions/data/fixtures";
import { listEntrantsEnriched } from "@/competitions/data/entrants";
import { listRoster } from "@/competitions/data/team-members";
import { getPlayersByRefs } from "@/competitions/data/players";
import { getCurrentStaff } from "@/lib/data/staff";
import { getCurrentAuthUserId, getMemberProfile } from "@/lib/data/members";
import { ReportSubMatchButton } from "@/competitions/components/ReportSubMatchButton";
import { LineupForm } from "@/competitions/components/LineupForm";
import type { Player, PlayerRef } from "@/competitions/types";

export const dynamic = "force-dynamic";

export default async function FixtureDetailPage({
  params,
}: {
  params: { id: string; fixtureId: string };
}) {
  const fixture = await getFixture(params.fixtureId);
  if (!fixture) notFound();
  if (fixture.competition_id !== params.id) notFound();

  const [competition, enriched, entrants, staff] = await Promise.all([
    getCompetition(params.id),
    getFixturesEnriched(params.id),
    listEntrantsEnriched(params.id),
    getCurrentStaff(),
  ]);
  if (!competition) notFound();

  const details = enriched.find((e) => e.fixture.id === params.fixtureId);
  const authUserId = await getCurrentAuthUserId();
  const viewer = authUserId ? await getMemberProfile(authUserId) : null;
  const isManagerOrOwner = staff?.role === "manager" || staff?.role === "owner";

  const entrantMap = new Map(entrants.map((e) => [e.entrant.id, e]));
  const homeEntrant = fixture.home_entrant_id
    ? entrantMap.get(fixture.home_entrant_id)
    : null;
  const awayEntrant = fixture.away_entrant_id
    ? entrantMap.get(fixture.away_entrant_id)
    : null;

  const homeName =
    homeEntrant?.subject?.kind === "team"
      ? homeEntrant.subject.team.name
      : "Home";
  const awayName =
    awayEntrant?.subject?.kind === "team"
      ? awayEntrant.subject.team.name
      : "Away";

  const viewerIsHomeCaptain =
    viewer !== null &&
    homeEntrant?.subject?.kind === "team" &&
    homeEntrant.subject.team.captain_member_id === viewer.id;
  const viewerIsAwayCaptain =
    viewer !== null &&
    awayEntrant?.subject?.kind === "team" &&
    awayEntrant.subject.team.captain_member_id === viewer.id;

  // Load each team's roster once so lineups can be edited.
  const homeRosterIds =
    homeEntrant?.subject?.kind === "team"
      ? (await listRoster(homeEntrant.subject.team.id)).map((r) => r.member_id)
      : [];
  const awayRosterIds =
    awayEntrant?.subject?.kind === "team"
      ? (await listRoster(awayEntrant.subject.team.id)).map((r) => r.member_id)
      : [];
  const rosterRefs: PlayerRef[] = [
    ...homeRosterIds.map((id) => ({ kind: "member" as const, id })),
    ...awayRosterIds.map((id) => ({ kind: "member" as const, id })),
  ];
  const rosterPlayerMap = await getPlayersByRefs(rosterRefs);
  const toRoster = (ids: string[]) =>
    ids
      .map((id) => {
        const p = rosterPlayerMap.get(`member:${id}`);
        return p
          ? { id: p.id, displayName: p.displayName }
          : { id, displayName: id };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const slots =
    competition.league_config?.sub_match_slots
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order) ?? [];

  return (
    <div className="space-y-6 p-4">
      <header>
        <Link
          href={`/competitions/${params.id}`}
          className="inline-flex items-center gap-1 text-xs text-white/50 hover:text-white"
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
          Back to competition
        </Link>
      </header>
      <section>
        <h1 className="text-2xl font-bold text-white">
          {homeName} <span className="text-white/40">vs</span> {awayName}
        </h1>
        <p className="mt-1 text-sm text-white/60">
          {new Date(fixture.fixture_date).toLocaleString()} ·{" "}
          <span className="uppercase tracking-wider text-white/50">
            {fixture.status.replace(/_/g, " ")}
          </span>
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/60">
          Sub-matches
        </h2>
        {details && details.subMatches.length > 0 ? (
          <ul className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-surface-1/70">
            {details.subMatches
              .slice()
              .sort((a, b) =>
                (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? "")
              )
              .map((m, i) => {
                const result = details.results.find(
                  (r) => r.match_id === m.id
                );
                const slot = slots[i];
                return (
                  <li key={m.id} className="space-y-2 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-white">
                          {slot
                            ? slot.kind === "singles"
                              ? `Singles ${i + 1}`
                              : `Doubles ${i + 1}`
                            : `Match ${i + 1}`}
                        </p>
                        <p className="mt-0.5 text-[11px] text-white/50">
                          {m.status}
                        </p>
                      </div>
                      {result && (
                        <p className="text-sm font-semibold text-white">
                          {result.score_a} – {result.score_b}
                        </p>
                      )}
                    </div>
                    <LineupDisplay
                      lineups={details.lineups.filter((l) => l.match_id === m.id)}
                      rosterPlayerMap={rosterPlayerMap}
                    />
                    {(viewerIsHomeCaptain ||
                      viewerIsAwayCaptain ||
                      isManagerOrOwner) &&
                      !result && (
                        <div className="flex gap-2">
                          {m.entrant_a_id && m.entrant_b_id && (
                            <ReportSubMatchButton
                              matchId={m.id}
                              entrantAId={m.entrant_a_id}
                              entrantAName={homeName}
                              entrantBId={m.entrant_b_id}
                              entrantBName={awayName}
                              raceToA={m.race_to_a}
                              raceToB={m.race_to_b}
                            />
                          )}
                        </div>
                      )}
                    {m.status === "scheduled" && slot && (
                      <details className="text-[11px] text-white/70">
                        <summary className="cursor-pointer text-white/60 hover:text-white">
                          Set lineup
                        </summary>
                        <div className="mt-2 space-y-3">
                          {(viewerIsHomeCaptain || isManagerOrOwner) && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-white/40">
                                {homeName}
                              </p>
                              <LineupForm
                                matchId={m.id}
                                side="a"
                                slotKind={slot.kind}
                                roster={toRoster(homeRosterIds)}
                                initialMemberIds={details.lineups
                                  .filter(
                                    (l) => l.match_id === m.id && l.side === "a"
                                  )
                                  .map((l) => l.member_id)}
                              />
                            </div>
                          )}
                          {(viewerIsAwayCaptain || isManagerOrOwner) && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-white/40">
                                {awayName}
                              </p>
                              <LineupForm
                                matchId={m.id}
                                side="b"
                                slotKind={slot.kind}
                                roster={toRoster(awayRosterIds)}
                                initialMemberIds={details.lineups
                                  .filter(
                                    (l) => l.match_id === m.id && l.side === "b"
                                  )
                                  .map((l) => l.member_id)}
                              />
                            </div>
                          )}
                        </div>
                      </details>
                    )}
                  </li>
                );
              })}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed border-white/15 bg-surface-1/50 p-6 text-center text-xs text-white/50">
            No sub-matches created for this fixture yet.
          </div>
        )}
      </section>
    </div>
  );
}

function LineupDisplay({
  lineups,
  rosterPlayerMap,
}: {
  lineups: { side: string; member_id: string }[];
  rosterPlayerMap: Map<string, Player>;
}) {
  if (lineups.length === 0) return null;
  const sideA = lineups.filter((l) => l.side === "a");
  const sideB = lineups.filter((l) => l.side === "b");
  const formatNames = (list: { member_id: string }[]) =>
    list
      .map(
        (l) => rosterPlayerMap.get(`member:${l.member_id}`)?.displayName ?? "?"
      )
      .join(", ") || "—";
  return (
    <div className="grid grid-cols-2 gap-4 text-[11px] text-white/70">
      <div>
        <p className="text-[9px] uppercase tracking-wider text-white/40">Side A</p>
        <p>{formatNames(sideA)}</p>
      </div>
      <div>
        <p className="text-[9px] uppercase tracking-wider text-white/40">Side B</p>
        <p>{formatNames(sideB)}</p>
      </div>
    </div>
  );
}
