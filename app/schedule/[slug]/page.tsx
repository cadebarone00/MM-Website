import { notFound } from "next/navigation";
import { VenueSchedulePage } from "@/components/schedule/VenueSchedulePage";
import { pastTournaments, nextTournament } from "@/lib/data";
import { getVenueBySlugAsync } from "@/lib/data/activeSeasonOverlay";

export function generateStaticParams() {
  return [...pastTournaments.map((t) => ({ slug: t.slug })), { slug: nextTournament.slug }];
}

export default async function ScheduleYearPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const venue = await getVenueBySlugAsync(slug);
  if (!venue) notFound();

  return (
    <div className="max-w-[1360px] mx-auto px-7 pt-8 pb-16">
      <VenueSchedulePage venue={venue} />
    </div>
  );
}
