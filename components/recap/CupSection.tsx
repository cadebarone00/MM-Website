import { CupPanel } from "@/components/home/CupPanel";
import { SectionHead } from "@/components/home/SectionHead";
import type { Tournament } from "@/lib/data/types";

export function CupSection({
  tournament,
  isLive,
  large = false,
  winnerText = null,
}: {
  tournament: Tournament;
  isLive: boolean;
  large?: boolean;
  winnerText?: string | null;
}) {
  const label = `${tournament.editionLabel} - ${isLive ? "Live" : "Final"}`;

  return (
    <section>
      <SectionHead eyebrow="Team Score" title="Total Points" />
      <CupPanel
        label={label}
        maroonPts={tournament.maroonPts}
        whitePts={tournament.whitePts}
        pointsAvailable={tournament.pointsAvailable}
        pointsToWin={tournament.pointsToWin}
        large={large}
        winnerText={winnerText}
      />
    </section>
  );
}
