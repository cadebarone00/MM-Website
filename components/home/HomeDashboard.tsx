"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, Play, Shield, Trophy, X } from "lucide-react";
import { SectionHead } from "@/components/home/SectionHead";
import { latestCompleted, fmtPt } from "@/lib/data";
import { getPlayerDisplayName } from "@/lib/data/players";

type ScheduleItem = { session: string; course: string; format: string };

type SessionSetupFeedItem = {
  round?: number;
  courseName?: string;
  format?: string;
};

const fallbackScheduleItems: ScheduleItem[] = [
  { session: "Session 1", course: "Mission Hills CC", format: "Fourball" },
  { session: "Session 2", course: "Mission Hills CC", format: "Singles" },
  { session: "Session 3", course: "Mission Hills CC", format: "Fourball" },
  { session: "Session 4", course: "Mission Hills CC", format: "Alternate Shot" },
  { session: "Session 5", course: "Mission Hills CC", format: "Singles" },
  { session: "Session 6", course: "Mission Hills CC", format: "Fourball" },
  { session: "Session 7", course: "Mission Hills CC", format: "Alternate Shot" },
  { session: "Session 8", course: "Mission Hills CC", format: "Singles" },
];

const highlights = [
  {
    title: "2027 board is staged",
    body: "Live highlights will stack here as scores, streaks, and match swings are entered.",
  },
  {
    title: `Team White ${fmtPt(latestCompleted.whitePts)}, Team Maroon ${fmtPt(latestCompleted.maroonPts)}`,
    body: `${latestCompleted.editionLabel} is loaded as the current placeholder while the 2027 event waits for play.`,
  },
  {
    title: `${getPlayerDisplayName(latestCompleted.individualChampion ?? "cam")} owns the latest title`,
    body: "Individual leaderboard notes will rotate into this rail once tournament scoring begins.",
  },
  {
    title: "Round 1 starts at 9:30 CST",
    body: "January 6, 2027 is the live flip point for the tournament experience.",
  },
];

const news = [
  {
    title: "Opening presser sets 2027 tone",
    kicker: "Press Room",
    image: "/champions/2026.jpg",
    body: [
      "The Maroon Masters home base is being staged for the 2027 tournament with live scoring, rosters, matches, highlights, and media all moving into one cleaner view.",
      "Once the tournament begins, this space can carry presser notes, daily recaps, player quotes, and official updates without sending fans away from the home screen.",
      "The goal is simple: make the site feel alive before, during, and after every session.",
    ],
  },
  {
    title: "Rosters take center stage",
    kicker: "Teams",
    image: "/teams/maroon/collage/01-hero-team.jpg",
    body: [
      "The Teams page now has player-forward roster pages, profile photos, favoriting, and direct links into individual bios.",
      "Fans can follow Maroon and White as separate identities while still jumping quickly into standings and tournament history.",
    ],
  },
  {
    title: "Mission Hills schedule shell ready",
    kicker: "Schedule",
    image: "/champions/2025.jpg",
    body: [
      "The schedule module is ready to carry courses, formats, and sessions for 2027.",
      "As tee sheets are finalized, the quick schedule card can be updated with exact course assignments and match formats.",
    ],
  },
];

type SocialReel = {
  id: string;
  caption: string;
  thumbnailUrl: string;
  permalink: string;
  timestamp?: string;
};

const fallbackReels: SocialReel[] = [
  {
    id: "opening-week",
    caption: "Opening Week",
    thumbnailUrl: "/champions/2026.jpg",
    permalink: "https://www.instagram.com/themaroonmasters/",
  },
  {
    id: "practice-rounds",
    caption: "Practice Rounds",
    thumbnailUrl: "/teams/maroon/collage/02-swing-pose.jpg",
    permalink: "https://www.instagram.com/themaroonmasters/",
  },
  {
    id: "pressers",
    caption: "Pressers",
    thumbnailUrl: "/teams/maroon/collage/05-walk-thumbsup.jpg",
    permalink: "https://www.instagram.com/themaroonmasters/",
  },
  {
    id: "final-putts",
    caption: "Final Putts",
    thumbnailUrl: "/champions/2025.jpg",
    permalink: "https://www.instagram.com/themaroonmasters/",
  },
];

function ActionCard({
  href,
  icon,
  title,
  body,
  children,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex aspect-square min-h-0 flex-col items-center justify-center gap-1 rounded-md border border-gold-400 bg-cream-50 p-2 shadow-sm transition-transform hover:-translate-y-1 hover:shadow-xl sm:min-h-[200px] sm:items-stretch sm:justify-between sm:gap-0 sm:rounded-lg sm:p-5 sm:shadow-lg xl:min-h-[260px] xl:p-6"
    >
      <div className="flex flex-col items-center sm:block">
        <div className="inline-flex h-8 w-8 items-center justify-center rounded-sm bg-maroon-800 text-gold-200 sm:mb-5 sm:h-11 sm:w-11">{icon}</div>
        <h2 className="m-0 text-center font-sans text-[11px] font-extrabold text-ink-900 sm:text-left sm:text-xl xl:text-2xl">{title}</h2>
        <p className="mt-3 hidden font-sans text-sm leading-relaxed text-ink-600 sm:block">{body}</p>
      </div>
      {children ?? (
        <div className="mt-5 hidden items-center gap-2 font-condensed text-xs font-semibold uppercase tracking-wide text-maroon-700 sm:flex">
          Open <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
        </div>
      )}
    </Link>
  );
}

function ScheduleCard() {
  const [items, setItems] = useState<ScheduleItem[]>(fallbackScheduleItems);

  useEffect(() => {
    let cancelled = false;

    async function loadSchedule() {
      try {
        const res = await fetch("/api/live-feed", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { sessionSetup?: SessionSetupFeedItem[] };
        const setup = Array.isArray(data.sessionSetup) ? data.sessionSetup : [];
        const nextItems = setup
          .filter((item) => typeof item.round === "number")
          .sort((a, b) => (a.round ?? 0) - (b.round ?? 0))
          .map((item) => ({
            session: `Session ${item.round}`,
            course: item.courseName || "Course TBD",
            format: item.format || "Format TBD",
          }));
        if (!cancelled && nextItems.length > 0) setItems(nextItems);
      } catch {
        if (!cancelled) setItems(fallbackScheduleItems);
      }
    }

    loadSchedule();
    const timer = window.setInterval(loadSchedule, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <Link
      href="/schedule"
      className="group flex aspect-square min-h-0 flex-col items-center justify-center gap-1 rounded-md border border-gold-400 bg-cream-50 p-2 shadow-sm transition-transform hover:-translate-y-1 hover:shadow-xl sm:min-h-[200px] sm:items-stretch sm:justify-start sm:gap-0 sm:rounded-lg sm:p-5 sm:shadow-lg xl:min-h-[260px] xl:p-6"
    >
      <div className="inline-flex h-8 w-8 items-center justify-center rounded-sm bg-maroon-800 text-gold-200 sm:mb-5 sm:h-11 sm:w-11">
        <CalendarDays size={22} />
      </div>
      <h2 className="m-0 text-center font-sans text-[11px] font-extrabold text-ink-900 sm:text-left sm:text-xl xl:text-2xl">Schedule</h2>
      <p className="mt-3 hidden font-sans text-sm leading-relaxed text-ink-600 sm:block">Here is your course and format schedule.</p>
      <div className="mt-4 hidden min-h-0 flex-1 overflow-y-auto border-t border-ink-200 pt-3 sm:block">
        {items.map((item) => (
          <div key={item.session} className="border-b border-ink-100 py-2 last:border-b-0">
            <div className="font-condensed text-xs font-semibold uppercase tracking-wide text-maroon-700">{item.session}</div>
            <div className="mt-1 font-sans text-sm font-bold text-ink-900">{item.course}</div>
            <div className="font-sans text-xs text-ink-500">{item.format}</div>
          </div>
        ))}
      </div>
    </Link>
  );
}
function HighlightsRail() {
  return (
    <aside className="col-span-3 rounded-lg border border-maroon-800 bg-maroon-900 p-3 text-white shadow-xl sm:p-5 xl:col-span-1 xl:row-span-3">
      <div className="xl:sticky xl:top-[94px]">
        <div className="mb-2 flex items-center gap-2 font-condensed text-xs font-semibold uppercase tracking-wide text-gold-300 sm:mb-3">
          <Trophy size={16} />
          Highlights
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-1 xl:max-h-[980px] xl:space-y-3 xl:gap-0 xl:overflow-y-auto xl:pr-1">
          {highlights.map((item) => (
            <article key={item.title} className="rounded-md border border-white/10 bg-white/[0.08] p-2 sm:p-4">
              <h3 className="m-0 font-sans text-xs font-extrabold text-white sm:text-base">{item.title}</h3>
              <p className="mt-1 font-sans text-[11px] leading-snug text-maroon-100 sm:mt-2 sm:text-sm sm:leading-relaxed">{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </aside>
  );
}

function NewsSection() {
  const [active, setActive] = useState<(typeof news)[number] | null>(null);

  return (
    <section>
      <SectionHead title="News" />
      <div className="grid grid-cols-2 gap-2 sm:gap-5 md:grid-cols-3">
        {news.map((item) => (
          <button
            key={item.title}
            type="button"
            onClick={() => setActive(item)}
            className="overflow-hidden rounded-md border border-ink-200 bg-white text-left shadow-sm transition-transform hover:-translate-y-1 hover:shadow-lg sm:rounded-lg sm:shadow-md"
          >
            <div className="relative aspect-[4/3] bg-ink-100">
              <Image src={item.image} alt="" fill sizes="(max-width: 640px) 50vw, 360px" className="object-cover" />
            </div>
            <div className="p-2 sm:p-5">
              <div className="font-condensed text-[9px] font-semibold uppercase tracking-wide text-maroon-600 sm:text-xs">{item.kicker}</div>
              <h3 className="m-0 mt-1 font-sans text-[11px] font-extrabold text-ink-900 sm:mt-2 sm:text-xl">{item.title}</h3>
            </div>
          </button>
        ))}
      </div>

      {active && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 px-5 py-8">
          <article className="relative max-h-[86vh] w-full max-w-[760px] overflow-y-auto rounded-lg bg-white shadow-2xl">
            <button
              type="button"
              aria-label="Close story"
              onClick={() => setActive(null)}
              className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-ink-900 shadow-md"
            >
              <X size={22} />
            </button>
            <div className="relative h-[280px] bg-ink-100">
              <Image src={active.image} alt="" fill sizes="760px" className="object-cover" />
            </div>
            <div className="p-8">
              <div className="font-condensed text-xs font-semibold uppercase tracking-wide text-maroon-600">{active.kicker}</div>
              <h2 className="m-0 mt-2 font-sans text-4xl font-extrabold text-ink-900">{active.title}</h2>
              <div className="mt-6 space-y-4">
                {active.body.map((paragraph) => (
                  <p key={paragraph} className="m-0 font-sans text-base leading-relaxed text-ink-600">
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}

function SocialsSection() {
  const [reels, setReels] = useState<SocialReel[]>(fallbackReels);

  useEffect(() => {
    let cancelled = false;

    async function loadReels() {
      try {
        const res = await fetch("/api/instagram-reels", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { reels?: SocialReel[] };
        const liveReels = Array.isArray(data.reels) ? data.reels.filter((item) => item.permalink) : [];
        if (!cancelled && liveReels.length > 0) {
          setReels([...liveReels, ...fallbackReels].slice(0, 4));
        }
      } catch {
        if (!cancelled) setReels(fallbackReels);
      }
    }

    loadReels();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section>
      <SectionHead title="Check Out Our Socials" />
      <div className="grid grid-cols-2 gap-2 sm:gap-5 xl:grid-cols-4">
        {reels.map((reel, index) => (
          <a
            key={`${reel.id}-${index}`}
            href={reel.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative flex aspect-[9/16] min-h-[160px] flex-col justify-between overflow-hidden rounded-md border border-gold-400 bg-gradient-to-b from-maroon-800 to-ink-900 p-2 text-white shadow-sm sm:min-h-[360px] sm:rounded-lg sm:p-5 sm:shadow-lg"
          >
            {reel.thumbnailUrl && (
              // Instagram thumbnails are remote URLs, so use a normal image rather than Next Image domain config.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={reel.thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/10 to-maroon-950/90" />
            <div className="relative flex items-center justify-between">
              <div className="font-condensed text-[9px] font-semibold uppercase tracking-wide text-gold-300 sm:text-xs">Instagram Reel</div>
              <Play size={12} fill="currentColor" className="sm:hidden" />
              <Play size={18} fill="currentColor" className="hidden sm:block" />
            </div>
            <div className="relative">
              <h3 className="m-0 line-clamp-3 font-sans text-xs font-extrabold sm:text-2xl">{reel.caption || "Maroon Masters Reel"}</h3>
              <p className="mt-1 font-condensed text-[9px] font-semibold uppercase tracking-wide text-gold-200 sm:mt-2 sm:text-xs">Watch on Instagram</p>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

export function HomeDashboard() {
  return (
    <section className="bg-cream-100">
      <div className="mx-auto grid max-w-[1440px] grid-cols-3 gap-2 px-4 py-4 sm:gap-4 sm:px-7 sm:py-8 xl:grid-cols-4 xl:gap-7">
        <ActionCard
          href="/teams"
          icon={<Shield size={22} />}
          title="Teams"
          body="Check out the Maroon and White rosters, player profiles, photos, bios, and team identities."
        />
        <ActionCard
          href="/leaderboard"
          icon={<Trophy size={22} />}
          title="Leaderboard"
          body="When the tournament is live, follow matches and individual standings in real time."
        />
        <ScheduleCard />
        <HighlightsRail />

        <div className="col-span-3 space-y-6 sm:space-y-10 xl:col-span-3">
          <NewsSection />
          <SocialsSection />
        </div>
      </div>
    </section>
  );
}
