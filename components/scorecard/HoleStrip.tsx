import Link from "next/link";
import type { RoundScorecard } from "@/lib/data";

/**
 * A tap-through row of every hole in a round, modeled on the circular hole
 * picker Scorekeeper's own host tools already use. The "current" hole is
 * the last one with a posted score — not selectable UI state, just a
 * read of the data, so it advances automatically as scores come in.
 */
export function HoleStrip({
  round,
  tournamentSlug,
  player,
}: {
  round: RoundScorecard;
  tournamentSlug: string;
  player: string;
}) {
  const playedHoles = round.holes.filter((h) => h.score > 0);
  const currentHole = playedHoles.length > 0 ? playedHoles[playedHoles.length - 1].hole : null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {round.holes.map((hole) => {
        const isCurrent = hole.hole === currentHole;
        const isPlayed = hole.score > 0;
        return (
          <Link
            key={hole.hole}
            href={`/leaderboard/${tournamentSlug}/players/${player.toLowerCase()}/${round.round}/${hole.hole}`}
            className={[
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 font-condensed text-sm font-bold transition-colors",
              isCurrent
                ? "border-maroon-700 bg-maroon-700 text-white"
                : isPlayed
                  ? "border-ink-200 bg-ink-100 text-ink-700"
                  : "border-ink-200 bg-white text-ink-400",
            ].join(" ")}
          >
            {hole.hole}
          </Link>
        );
      })}
    </div>
  );
}
