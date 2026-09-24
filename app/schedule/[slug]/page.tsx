import { ScheduleAccordion } from "@/components/schedule/ScheduleAccordion";
import { notFound } from "next/navigation";
import { VenueSchedulePage } from "@/components/schedule/VenueSchedulePage";
import { pastTournaments, nextTournament } from "@/lib/data";
import { getVenueBySlugAsync, getUpcomingRoundSchedule } from "@/lib/data/activeSeasonOverlay";

// Without this, generateStaticParams below makes Next.js prerender this
// page once and cache it (same as any other statically-generated route) —
// the upcoming year's schedule would then only ever reflect Tiger
// Center's live round/course setup as of the last deploy, not in real
// time. Same reasoning as app/broadcast/page.tsx and app/watch-live/page.tsx.
export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return [...pastTournaments.map((t) => ({ slug: t.slug })), { slug: nextTournament.slug }];
}

export default async function ScheduleYearPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ date?: string | string[] }> }) {
  const { slug } = await params;
  const venue = await getVenueBySlugAsync(slug);
  if (!venue) notFound();

  // Only the upcoming year has a Tiger Center round setup to read — past
  // years stay on the static venue.sessions/venue.courses data below.
  const rounds = slug === nextTournament.slug ? await getUpcomingRoundSchedule() : [];

  const { date } = await searchParams;
  if (date !== undefined) {
    if (slug !== nextTournament.slug || typeof date !== "string" || ![6, 7, 8, 9].some(day => date === `${nextTournament.year}-01-0${day}`)) notFound();
    return <ScheduleAccordion key={date} rounds={rounds} year={nextTournament.year} initialDate={date} />;
  }

  return (
    <div className="max-w-[1360px] mx-auto px-7 pt-8 pb-16">
      <VenueSchedulePage venue={venue} rounds={rounds} />
    </div>
  );
}
