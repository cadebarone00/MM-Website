import { Badge } from "@/components/ui/Badge";
import { champion, fmtPt } from "@/lib/data";
import type { Tournament } from "@/lib/data/types";

export function TournamentHeader({ tournament, title }: { tournament: Tournament; title: string }) {
  const champ = champion(tournament);
  return (
    <div className="flex items-end justify-between mb-2 gap-4 flex-wrap">
      <div>
        <div className="font-condensed text-[11px] font-semibold tracking-eyebrow uppercase text-maroon-600 mb-[6px]">
          {tournament.editionLabel} · {tournament.venue} · {tournament.dateLabel}
        </div>
        <h1 className="font-sans text-[36px] font-extrabold text-ink-900 m-0">{title}</h1>
      </div>
      <Badge variant={champ === "maroon" ? "maroon" : "neutral"}>
        Final · {champ === "maroon" ? "Maroon" : "White"} won {fmtPt(Math.max(tournament.maroonPts, tournament.whitePts))}–
        {fmtPt(Math.min(tournament.maroonPts, tournament.whitePts))}
      </Badge>
    </div>
  );
}
