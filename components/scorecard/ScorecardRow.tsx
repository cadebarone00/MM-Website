import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { HoleMarkerForDiff } from "./HoleMarker";
import type { RoundScorecard, Team } from "@/lib/data";

interface ScorecardRowProps {
  round: RoundScorecard;
  tournamentSlug: string;
  player: string;
  team?: Team;
  linkHoles?: boolean;
}

function HoleCell({
  hole,
  tournamentSlug,
  player,
  round,
  linkHoles,
}: {
  hole: RoundScorecard["holes"][number];
  tournamentSlug: string;
  player: string;
  round: number;
  linkHoles: boolean;
}) {
  if (!hole.score) {
    return (
      <div className="flex items-center justify-center w-9 shrink-0">
        <span className="font-sans text-xs text-ink-300">–</span>
      </div>
    );
  }

  const marker = (
    <HoleMarkerForDiff diff={hole.diff} size={28}>
      {hole.score}
    </HoleMarkerForDiff>
  );

  return (
    <div className="flex items-center justify-center w-9 shrink-0">
      {linkHoles ? (
        <Link
          href={`/leaderboard/${tournamentSlug}/players/${player.toLowerCase()}/${round}/${hole.hole}`}
          className="hover:opacity-75 transition-opacity"
        >
          {marker}
        </Link>
      ) : (
        marker
      )}
    </div>
  );
}

function TotalCell({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-center justify-center w-12 shrink-0 px-1">
      <span className="font-score text-sm font-bold text-ink-900 tabular-nums leading-none">{value}</span>
      <span className="font-condensed text-[9px] font-semibold tracking-eyebrow uppercase text-ink-400 leading-none mt-[2px]">{label}</span>
    </div>
  );
}

export function ScorecardRow({ round, tournamentSlug, player, team, linkHoles = true }: ScorecardRowProps) {
  const front = round.holes.slice(0, 9);
  const back = round.holes.slice(9, 18);
  const frontPlayed = front.some((h) => h.score > 0);
  const backPlayed = back.some((h) => h.score > 0);
  const outTotal: number | string = frontPlayed ? front.reduce((s, h) => s + h.score, 0) : "–";
  const inTotal: number | string = backPlayed ? back.reduce((s, h) => s + h.score, 0) : "–";

  return (
    <div className="flex items-center gap-1 py-[6px] px-3 bg-white border border-ink-100 rounded-md overflow-x-auto">
      <div className="flex items-center gap-[10px] w-[148px] shrink-0 pr-2 mr-1 border-r border-ink-100">
        <Avatar name={player} size="xs" team={team ?? null} />
        <span className="font-sans text-[13px] font-semibold text-ink-900 whitespace-nowrap overflow-hidden text-ellipsis">{player}</span>
      </div>

      <div className="flex items-center">
        {front.map((h) => (
          <HoleCell key={h.hole} hole={h} tournamentSlug={tournamentSlug} player={player} round={round.round} linkHoles={linkHoles} />
        ))}
      </div>

      <TotalCell label="Out" value={outTotal} />
      <div className="w-px h-6 bg-ink-200 mx-1 shrink-0" />

      {back.length > 0 && (
        <>
          <div className="flex items-center">
            {back.map((h) => (
              <HoleCell key={h.hole} hole={h} tournamentSlug={tournamentSlug} player={player} round={round.round} linkHoles={linkHoles} />
            ))}
          </div>
          <TotalCell label="In" value={inTotal} />
          <div className="w-px h-6 bg-ink-200 mx-1 shrink-0" />
        </>
      )}

      <div className="flex flex-col items-center justify-center w-14 shrink-0 pl-1">
        <span className="font-score text-lg font-extrabold text-maroon-700 tabular-nums leading-none">{round.total}</span>
        <span className="font-condensed text-[9px] font-semibold tracking-eyebrow uppercase text-ink-400 leading-none mt-[2px]">Total</span>
      </div>
    </div>
  );
}
