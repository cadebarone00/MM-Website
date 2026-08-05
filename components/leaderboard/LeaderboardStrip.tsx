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
    <div className="flex gap-3 overflow-x-auto py-3 pl-4 pr-1 sm:gap-4 sm:py-4 sm:pl-7">
      {ranked.map((entry, i) => (
        <Link
          key={entry.player}
          href={`/leaderboard/${tournament.slug}/players/${entry.player.toLowerCase()}`}
          className="flex shrink-0 flex-col items-center gap-1 w-12 text-center hover:opacity-80 transition-opacity sm:w-14"
        >
          <span className="relative inline-flex">
            <Avatar name={getPlayerDisplayName(entry.player)} src={getPlayerAvatar(entry.player)} size="md" team={entry.team} />
            <span className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-maroon-700 px-1 py-0.5 font-score text-[9px] font-bold text-white shadow">
              {scoreLabel(entry.toPar)}
            </span>
          </span>
          <span className="font-sans text-[10px] font-semibold text-ink-900 truncate w-full">
            {posLabel(i, ranked)}. {getPlayerDisplayName(entry.player).split(" ").pop()}
          </span>
        </Link>
      ))}
    </div>
  );
}
