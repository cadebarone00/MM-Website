import type { ReactNode } from "react";
import { GolfTripCompetitionPreviewProvider } from "@/components/platform/GolfTripCompetitionPreviewProvider";

export default function TournamentPreviewLayout({ children }: { children: ReactNode }) {
  return <GolfTripCompetitionPreviewProvider>{children}</GolfTripCompetitionPreviewProvider>;
}
