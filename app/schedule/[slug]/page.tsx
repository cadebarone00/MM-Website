import Link from "next/link";
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
    const dayRounds = rounds.filter(round => round.date === date);
    return <main className="mx-auto max-w-5xl px-5 py-10">
      <Link href="/schedule" className="text-maroon-700">Back to Schedule</Link>
      <h1 className="mt-6 font-serif text-4xl">January {Number(date.slice(-2))}</h1>
      <p className="mt-2 text-ink-500">Mission Hills Country Club &middot; Palm Springs, CA</p>
      {dayRounds.length ? <div className="mt-8 grid gap-4 sm:grid-cols-2">{dayRounds.map(round => <section key={round.round} className="rounded border border-gold-300 p-6"><h2 className="font-serif text-2xl">Round {round.round}</h2><p className="mt-3">{round.format ?? "Format to be announced"}</p><p>{round.courseName ?? "Course to be announced"}</p></section>)}</div> : <p className="mt-8">The schedule and course details for this day will be added here.</p>}
    </main>;
  }

  return (
    <div className="max-w-[1360px] mx-auto px-7 pt-8 pb-16">
      <VenueSchedulePage venue={venue} rounds={rounds} />
    </div>
  );
}
