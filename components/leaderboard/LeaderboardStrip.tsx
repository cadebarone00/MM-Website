import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { getPlayerAvatar, getPlayerDisplayName } from "@/lib/data/players";
import type { Tournament } from "@/lib/data/types";

function posLabel(index: number, ranked: { toPar: number }[]): string {
  const pos = index + 1;
  const tied = ranked.filter((p) => p.toPar === ranked[index].toPar).length > 1;
  return `${tied ? "T" : ""}${pos}`;
}

function scoreLabel(toPar: number): string {
  return toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : String(toPar);
}

/** Ranked player-strip, winner first, horizontally scrollable (native scroll — touch swipe on mobile, trackpad/shift-scroll on desktop). */
export function LeaderboardStrip({ tournament }: { tournament: Tournament }) {
  const ranked = [...tournament.individualLeaderboard].sort((a, b) => a.toPar - b.toPar);

  if (ranked.length === 0) return null;

  return (
    <div className="flex gap-4 overflow-x-auto px-4 py-4 sm:px-7">
      {ranked.map((entry, i) => (
        <Link
          key={entry.player}
          href={`/leaderboard/${tournament.slug}/players/${entry.player.toLowerCase()}`}
          className="flex shrink-0 flex-col items-center gap-1 w-16 text-center hover:opacity-80 transition-opacity"
        >
          <span className="relative inline-flex">
            <Avatar name={getPlayerDisplayName(entry.player)} src={getPlayerAvatar(entry.player)} size="lg" team={entry.team} />
            <span className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-maroon-700 px-1.5 py-0.5 font-score text-[10px] font-bold text-white shadow">
              {scoreLabel(entry.toPar)}
            </span>
          </span>
          <span className="font-sans text-[11px] font-semibold text-ink-900 truncate w-full">
            {posLabel(i, ranked)}. {getPlayerDisplayName(entry.player).split(" ").pop()}
          </span>
        </Link>
      ))}
    </div>
  );
}
