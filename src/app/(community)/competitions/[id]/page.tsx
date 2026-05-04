import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentStaff } from "@/lib/data/staff";
import { getCurrentAuthUserId, getMemberProfile } from "@/lib/data/members";
import { getCompetition } from "@/competitions/data/competitions";
import { listEntrantsEnriched } from "@/competitions/data/entrants";
import { listBracketMatches } from "@/competitions/data/bracket";
import { listResultsForCompetition } from "@/competitions/data/match-results";
import { listGameTypes } from "@/competitions/data/game-types";
import { getCompetitionStandings } from "@/competitions/data/league-standings";
import { getFixturesEnriched } from "@/competitions/data/fixtures";
import { listRoster } from "@/competitions/data/team-members";
import { getDivision } from "@/competitions/data/divisions";
import { GenerateScheduleForm } from "@/competitions/components/GenerateScheduleForm";
import { Bracket } from "@/competitions/components/Bracket";
import { StandingsTable } from "@/competitions/components/StandingsTable";
import { FixtureList } from "@/competitions/components/FixtureList";
import { RegistrationButton } from "@/competitions/components/RegistrationButton";
import { WithdrawButton } from "@/competitions/components/WithdrawButton";
import { PublishBracketButton } from "@/competitions/components/PublishBracketButton";

export const dynamic = "force-dynamic";

async function LeagueSections({
  competitionId,
  entrants,
  viewerMemberId,
}: {
  competitionId: string;
  entrants: Awaited<ReturnType<typeof listEntrantsEnriched>>;
  viewerMemberId: string | null;
}) {
  const [standings, fixtures] = await Promise.all([
    getCompetitionStandings(competitionId),
    getFixturesEnriched(competitionId),
  ]);

  const entrantNameMap = new Map<string, string>();
  for (const e of entrants) {
    const name =
      e.subject?.kind === "team"
        ? e.subject.team.name
        : e.subject?.kind === "player"
          ? e.subject.player.displayName
          : "Unknown";
    entrantNameMap.set(e.entrant.id, name);
  }

  // Highlight the viewer's team entrant in the standings table when they're
  // a roster member on a team in this competition.
  let viewerEntrantId: string | undefined;
  if (viewerMemberId) {
    for (const e of entrants) {
      if (e.subject?.kind !== "team") continue;
      const roster = await listRoster(e.subject.team.id);
      if (roster.some((r) => r.member_id === viewerMemberId)) {
        viewerEntrantId = e.entrant.id;
        break;
      }
    }
  }

  return (
    <>
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/60">
          Standings
        </h2>
        {standings.success ? (
          <StandingsTable
            rows={standings.data.rows}
            entrantNames={entrantNameMap}
            highlightEntrantId={viewerEntrantId}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-white/15 bg-surface-1/50 p-6 text-center text-xs text-white/50">
            {standings.error}
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/60">
          Fixtures
        </h2>
        <FixtureList
          competitionId={competitionId}
          fixtures={fixtures}
          entrantNames={entrantNameMap}
        />
      </section>
    </>
  );
}

async function ManagerLeagueControls({ divisionId }: { divisionId: string }) {
  const division = await getDivision(divisionId);
  if (!division) return null;
  return (
    <section className="rounded-xl border border-white/10 bg-surface-1/70 p-4">
      <p className="mb-3 text-[10px] uppercase tracking-wider text-white/40">
        Schedule generator
      </p>
      <GenerateScheduleForm
        seasonId={division.season_id}
        divisionId={divisionId}
      />
    </section>
  );
}

export default async function CompetitionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const competition = await getCompetition(params.id);
  if (!competition) notFound();

  const [entrants, matches, gameTypes, staff] = await Promise.all([
    listEntrantsEnriched(params.id),
    listBracketMatches(params.id),
    listGameTypes(),
    getCurrentStaff(),
  ]);

  const gameType = gameTypes.find((g) => g.id === competition.game_type_id);

  // Resolve the current viewer as a member (if any). Staff reuse this page
  // too but don't need a member row to view it.
  const authUserId = await getCurrentAuthUserId();
  const member = authUserId ? await getMemberProfile(authUserId) : null;

  // Which of the competition's entrants is the viewer?
  const viewerEntrant =
    member !== null
      ? entrants.find((e) => e.entrant.entrant_member_id === member.id) ?? null
      : null;
  const isRegistered = viewerEntrant !== null;

  const isManagerOrOwner = staff?.role === "manager" || staff?.role === "owner";

  // Batch-load every result for the competition in one query (was a per-match
  // dynamic import loop pre-S23).
  const results = await listResultsForCompetition(params.id);

  const activeEntrantCount = entrants.filter(
    (e) => e.entrant.status === "active"
  ).length;

  // Find the viewer's next scheduled match (for members).
  const viewerNextMatch =
    viewerEntrant !== null
      ? matches.find(
          (m) =>
            m.status === "scheduled" &&
            (m.entrant_a_id === viewerEntrant.entrant.id ||
              m.entrant_b_id === viewerEntrant.entrant.id)
        ) ?? null
      : null;

  return (
    <div className="space-y-6 p-4">
      <header>
        <Link
          href="/competitions"
          className="inline-flex items-center gap-1 text-xs text-white/50 hover:text-white"
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
          Competitions
        </Link>
      </header>

      <section>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">
              {competition.name}
            </h1>
            {competition.description && (
              <p className="mt-1 text-sm text-white/60">
                {competition.description}
              </p>
            )}
          </div>
          <span className="rounded-full border border-white/15 bg-surface-2/70 px-3 py-1 text-[11px] uppercase tracking-wider text-white/70">
            {competition.status.replace(/_/g, " ")}
          </span>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-white/40">
              Kind
            </dt>
            <dd className="text-sm text-white/80">
              {competition.kind}
              {competition.format ? ` · ${competition.format.replace("_", " ")}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-white/40">
              Entrants
            </dt>
            <dd className="text-sm text-white/80">{activeEntrantCount}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-white/40">
              Game
            </dt>
            <dd className="text-sm text-white/80">
              {gameType?.display_name ?? competition.game_type_id}
            </dd>
          </div>
          {competition.starts_at && (
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-white/40">
                Starts
              </dt>
              <dd className="text-sm text-white/80">
                {new Date(competition.starts_at).toLocaleDateString()}
              </dd>
            </div>
          )}
        </dl>
      </section>

      {/* Status-conditional CTAs */}
      {competition.status === "draft" && (
        <section className="rounded-xl border border-dashed border-white/15 bg-surface-1/30 p-4 text-center text-xs text-white/50">
          This competition is still a draft — registration hasn&apos;t opened
          yet.
        </section>
      )}

      {competition.status === "registration_open" && (
        <section className="rounded-xl border border-white/10 bg-surface-1/70 p-4">
          {member !== null && competition.entrant_type === "individual" ? (
            <div className="space-y-2">
              <p className="text-sm text-white">
                {isRegistered
                  ? "You're registered for this tournament."
                  : "Registration is open. Grab a spot."}
              </p>
              <RegistrationButton
                competitionId={competition.id}
                isRegistered={isRegistered}
              />
            </div>
          ) : (
            <p className="text-xs text-white/50">
              {competition.entrant_type === "team"
                ? "This is a team competition — ask your team captain to register."
                : "Sign in as a member to register."}
            </p>
          )}

          {isManagerOrOwner && (
            <div className="mt-4 border-t border-white/10 pt-4">
              <p className="mb-2 text-[10px] uppercase tracking-wider text-white/40">
                Manager controls
              </p>
              <PublishBracketButton
                competitionId={competition.id}
                canPublish={true}
                canClear={false}
                entrantCount={activeEntrantCount}
              />
            </div>
          )}
        </section>
      )}

      {competition.status === "in_progress" && viewerNextMatch && (
        <section className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-accent">
            Your next match
          </p>
          <p className="mt-1 text-sm text-white">
            Round {viewerNextMatch.round_number} · Match{" "}
            {viewerNextMatch.bracket_position}
          </p>
        </section>
      )}

      {competition.status === "in_progress" &&
        competition.kind === "tournament" &&
        viewerEntrant !== null && (
          <section className="rounded-xl border border-white/10 bg-surface-1/70 p-4">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-white/40">
              Your entry
            </p>
            <WithdrawButton competitionId={competition.id} />
          </section>
        )}

      {competition.status === "in_progress" &&
        competition.kind === "tournament" &&
        isManagerOrOwner && (
          <section className="rounded-xl border border-white/10 bg-surface-1/70 p-4">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-white/40">
              Manager controls
            </p>
            <PublishBracketButton
              competitionId={competition.id}
              canPublish={false}
              canClear={true}
              entrantCount={activeEntrantCount}
            />
          </section>
        )}

      {competition.kind === "tournament" && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/60">
            Bracket
          </h2>
          <Bracket
            matches={matches}
            entrants={entrants}
            results={results}
            currentEntrantId={viewerEntrant?.entrant.id ?? null}
            showManagerControls={isManagerOrOwner}
          />
        </section>
      )}

      {competition.kind === "league" && (
        <>
          <LeagueSections
            competitionId={competition.id}
            entrants={entrants}
            viewerMemberId={member?.id ?? null}
          />
          {isManagerOrOwner && competition.division_id && (
            <ManagerLeagueControls divisionId={competition.division_id} />
          )}
        </>
      )}

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/60">
          Entrants ({entrants.length})
        </h2>
        {entrants.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 bg-surface-1/50 p-6 text-center text-xs text-white/50">
            No entrants yet.
          </div>
        ) : (
          <ul className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-surface-1/70">
            {entrants.map((enriched) => (
              <li
                key={enriched.entrant.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-surface-2 text-[11px] text-white/60">
                    {enriched.entrant.seed_number ?? "—"}
                  </span>
                  <div className="text-sm text-white">
                    {enriched.subject?.kind === "player"
                      ? enriched.subject.player.displayName
                      : enriched.subject?.kind === "team"
                        ? enriched.subject.team.name
                        : "Unknown"}
                  </div>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-white/50">
                  {enriched.entrant.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
