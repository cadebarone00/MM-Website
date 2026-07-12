import Image from "next/image";
import { PlayerLine } from "./PlayerLine";
import { fmtPt } from "@/lib/data";
import type { Team, Tournament } from "@/lib/data/types";

interface RosterProps {
  team: Team;
  crest: string;
  name: string;
  pts: number;
  players: string[];
  standings: Tournament["individualLeaderboard"];
}

export function Roster({ team, crest, name, pts, players, standings }: RosterProps) {
  const isMaroon = team === "maroon";
  const toParFor = (player: string) => standings.find((s) => s.player === player)?.toPar ?? null;
  const sorted = [...players].sort((a, b) => (toParFor(a) ?? 0) - (toParFor(b) ?? 0));

  return (
    <div className={["bg-white rounded-lg shadow-sm overflow-hidden border", isMaroon ? "border-maroon-200" : "border-ink-200"].join(" ")}>
      <div
        className={[
          "px-[22px] py-5 flex items-center gap-4 border-b",
          isMaroon ? "bg-gradient-maroon border-gold-600" : "bg-cream-100 border-maroon-700",
        ].join(" ")}
      >
        <Image src={crest} alt={name} width={120} height={140} className="h-16 w-auto" />
        <div className="flex-1">
          <div className={["font-condensed text-[11px] font-semibold tracking-[0.14em] uppercase", isMaroon ? "text-gold-300" : "text-maroon-600"].join(" ")}>
            {players.length} player{players.length === 1 ? "" : "s"}
          </div>
          <div className={["font-serif text-2xl font-bold", isMaroon ? "text-cream-50" : "text-maroon-700"].join(" ")}>{name}</div>
        </div>
        <div className="text-right">
          <div className={["font-condensed text-[44px] font-bold leading-none", isMaroon ? "text-gold-300" : "text-maroon-700"].join(" ")}>
            {fmtPt(pts)}
          </div>
          <div className={["font-condensed text-[10px] font-semibold tracking-[0.12em] uppercase", isMaroon ? "text-maroon-200" : "text-ink-400"].join(" ")}>
            Points
          </div>
        </div>
      </div>
      <div className="py-[6px]">
        {sorted.map((p, i) => (
          <PlayerLine key={p} name={p} team={team} toPar={toParFor(p)} last={i === sorted.length - 1} />
        ))}
      </div>
    </div>
  );
}
