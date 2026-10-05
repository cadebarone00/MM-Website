import { GolfTripCompetitionPreviewProvider } from "@/components/platform/GolfTripCompetitionPreviewProvider";

export default function MaroonUPreviewLayout({ children }: { children: React.ReactNode }) {
  return <GolfTripCompetitionPreviewProvider>{children}</GolfTripCompetitionPreviewProvider>;
}
