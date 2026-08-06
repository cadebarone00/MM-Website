import Link from "next/link";
import { ResultChevron } from "@/components/match/ResultChevron";
import { matchStatus, matchLeader, liveLabel } from "@/components/leaderboard/matchUtils";
import { getPlayerDisplayName } from "@/lib/data/players";
import { matchPropMarkets } from "@/lib/wagers/mockOdds";
import { MatchWinnerCard } from "./MatchWinnerCard";
import { PropBetRow } from "./PropBetRow";
import type { RealMatch } from "@/lib/data/types";

function TeamNames({
  players,
  tournamentSlug,
  align,
}: {
  players: string[];
  tournamentSlug: string;
  align: "left" | "right";
}) {
  return (
    <div className={["flex flex-1 flex-col gap-1", align === "right" ? "items-end text-right" : "items-start text-left"].join(" ")}>
      {players.map((player) => (
        <Link
          key={player}
          href={`/leaderboard/${tournamentSlug}/players/${player.toLowerCase()}`}
          className="font-sans text-base font-semibold text-ink-900 hover:opacity-70"
        >
          {getPlayerDisplayName(player)}
        </Link>
      ))}
    </div>
  );
}

/**
 * Shared between the static-year and live Match Breakdown routes — same
 * split pattern as `PlayerProfileHeader`/`PlayerScorecardView` for the
 * player tournament profile page: one view, fed either static or live data.
 */
export function MatchBreakdownView({
  tournamentSlug,
  editionLabel,
  match,
}: {
  tournamentSlug: string;
  editionLabel: string;
  match: RealMatch;
}) {
  const status = matchStatus(match);
  const leader = matchLeader(match);
  const label = liveLabel(match);
  const propMarkets = matchPropMarkets(match);

  return (
    <div>
      <p className="m-0 font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-400">
        {editionLabel} &middot; Day {match.day} &middot; {match.session} &middot; {match.format}
      </p>

      <div className="mt-3 flex items-center gap-3">
        <TeamNames players={match.maroonPlayers} tournamentSlug={tournamentSlug} align="left" />
        {status === "final" ? (
          <ResultChevron winner={leader} size="md">
            {label}
          </ResultChevron>
        ) : (
          <span className="inline-flex min-h-[34px] min-w-[58px] items-center justify-center rounded-pill border border-ink-300 bg-cream-50 px-2 font-condensed text-sm font-extrabold uppercase tracking-wide text-ink-900">
            {status === "scheduled" ? match.teeTimeCst ?? "VS" : label}
          </span>
        )}
        <TeamNames players={match.whitePlayers} tournamentSlug={tournamentSlug} align="right" />
      </div>

      <section className="mt-8">
        <h2 className="m-0 font-serif text-xl font-bold text-ink-900">Wagers</h2>
        <div className="mt-3 flex flex-col gap-4">
          <MatchWinnerCard tournamentSlug={tournamentSlug} match={match} />
          <div className="rounded-md border border-ink-100 bg-white p-4">
            <p className="m-0 font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-400">Player Props</p>
            <div className="mt-1">
              {propMarkets.map((market) => (
                <PropBetRow key={market.id} tournamentSlug={tournamentSlug} day={match.day} market={market} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="m-0 font-serif text-xl font-bold text-ink-900">Statistics</h2>
        <div className="mt-3 rounded-md border border-ink-100 bg-cream-50 p-4">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-400">Format</dt>
              <dd className="m-0 font-sans text-sm font-semibold text-ink-900">{match.format}</dd>
            </div>
            <div>
              <dt className="font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-400">Session</dt>
              <dd className="m-0 font-sans text-sm font-semibold text-ink-900">{match.session}</dd>
            </div>
            <div>
              <dt className="font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-400">Status</dt>
              <dd className="m-0 font-sans text-sm font-semibold capitalize text-ink-900">{status}</dd>
            </div>
            <div>
              <dt className="font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-400">Thru</dt>
              <dd className="m-0 font-sans text-sm font-semibold text-ink-900">{match.thru ?? "—"}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
