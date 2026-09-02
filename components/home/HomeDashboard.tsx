"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ArrowLeft, Play, Trophy, X } from "lucide-react";
import { SectionHead } from "@/components/home/SectionHead";
import { QuickLeaderboardCard } from "@/components/home/QuickLeaderboardCard";
import { QuickTeamsCard } from "@/components/home/QuickTeamsCard";
import { QuickScheduleCard } from "@/components/home/QuickScheduleCard";
import { HomeTeamsPanel } from "@/components/home/HomeTeamsPanel";
import { Tabs } from "@/components/ui/Tabs";
import type { TabItem } from "@/components/ui/Tabs";
import { latestCompleted, fmtPt } from "@/lib/data";
import { getPlayerDisplayName } from "@/lib/data/players";
import type { NextTournamentOverride } from "@/lib/data/types";

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
  {
    title: "Course walkthrough coming soon",
    body: "A hole-by-hole preview of Mission Hills CC is queued for this rail once it's ready.",
  },
  {
    title: "Rosters lock soon",
    body: "The final 6-and-6 rosters for 2027 will post here the moment the sheet is confirmed.",
  },
  {
    title: "Media day on the calendar",
    body: "Team photos and player intros are planned ahead of the opening tee time.",
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
];

type HypeVideoSlot = {
  id: string;
  caption: string;
  thumbnailUrl: string;
};

// TODO: swap these placeholders for real hype video thumbnails/links once uploaded.
const hypeVideoSlots: HypeVideoSlot[] = [
  { id: "hype-slot-1", caption: "Hype Video", thumbnailUrl: "/champions/2026.jpg" },
  { id: "hype-slot-2", caption: "Hype Video", thumbnailUrl: "/champions/2025.jpg" },
];

// TODO: point this at the real "all videos" destination once it exists.
const ALL_VIDEOS_HREF = "#";

const HIGHLIGHTS_PREVIEW_COUNT = 6;

function HighlightsRail({ flat = false }: { flat?: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const preview = highlights.slice(0, HIGHLIGHTS_PREVIEW_COUNT);
  const hasMore = highlights.length > HIGHLIGHTS_PREVIEW_COUNT;

  return (
    <>
      {flat ? (
        <div className="flex h-full min-w-0 flex-col">
          <div className="min-h-0 flex-1 divide-y divide-ink-100 overflow-y-auto">
            {preview.map((item) => (
              <article key={item.title} className="py-3 first:pt-0">
                <h3 className="m-0 font-sans text-sm font-bold text-maroon-700">{item.title}</h3>
                <p className="mt-1 font-sans text-xs leading-snug text-ink-500">{item.body}</p>
              </article>
            ))}
          </div>
          {hasMore && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-3 self-start font-sans text-xs font-semibold text-maroon-700 underline underline-offset-2 hover:text-maroon-600"
            >
              More Highlights
            </button>
          )}
        </div>
      ) : (
        <aside className="flex h-full min-w-0 flex-col rounded-lg border border-maroon-800 bg-maroon-900 p-3 text-white shadow-xl sm:p-5">
          <div className="mb-2 flex items-center gap-2 font-condensed text-xs font-semibold uppercase tracking-wide text-gold-300 sm:mb-3">
            <Trophy size={16} />
            Highlights
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 sm:space-y-3">
            {preview.map((item) => (
              <article key={item.title} className="rounded-md border border-white/10 bg-white/[0.08] p-2 sm:p-4">
                <h3 className="m-0 font-sans text-xs font-extrabold text-white sm:text-base">{item.title}</h3>
                <p className="mt-1 font-sans text-[11px] leading-snug text-maroon-100 sm:mt-2 sm:text-sm sm:leading-relaxed">{item.body}</p>
              </article>
            ))}
          </div>
          {hasMore && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-2 self-start font-sans text-[11px] font-semibold text-gold-300 underline underline-offset-2 hover:text-gold-200 sm:mt-3 sm:text-sm"
            >
              More Highlights
            </button>
          )}
        </aside>
      )}

      {showAll && (
        <div className="fixed inset-0 z-[200] overflow-y-auto bg-maroon-900">
          <button
            type="button"
            aria-label="Back"
            onClick={() => setShowAll(false)}
            className="fixed left-4 top-4 z-10 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 font-sans text-sm font-semibold text-white shadow-md hover:bg-white/20"
          >
            <ArrowLeft size={18} />
            Back
          </button>
          <div className="mx-auto max-w-[720px] px-5 pb-10 pt-20 sm:px-8">
            <h2 className="m-0 mb-6 font-sans text-2xl font-extrabold text-white">All Highlights</h2>
            <div className="space-y-3">
              {highlights.map((item) => (
                <article key={item.title} className="rounded-md border border-white/10 bg-white/[0.08] p-4">
                  <h3 className="m-0 font-sans text-base font-extrabold text-white">{item.title}</h3>
                  <p className="mt-2 font-sans text-sm leading-relaxed text-maroon-100">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

type ToggleTab = "highlights" | "teams" | "schedule";

const TOGGLE_TABS: TabItem[] = [
  { value: "highlights", label: "Highlights" },
  { value: "teams", label: "Teams" },
  { value: "schedule", label: "Schedule" },
];

/** Mobile-only replacement for the 2-column Highlights/quick-cards block: one full-width panel, switched by a 3-way toggle, defaulting to Highlights. */
function MobileHighlightsToggle({ nextTournamentOverride }: { nextTournamentOverride: NextTournamentOverride }) {
  const [tab, setTab] = useState<ToggleTab>("highlights");

  return (
    <div className="lg:hidden">
      <Tabs items={TOGGLE_TABS} value={tab} onChange={(v) => setTab(v as ToggleTab)} variant="plain" />
      <div className="mt-4">
        {tab === "highlights" && <HighlightsRail flat />}
        {tab === "teams" && <HomeTeamsPanel />}
        {tab === "schedule" && <QuickScheduleCard nextTournamentOverride={nextTournamentOverride} />}
      </div>
    </div>
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
            <div className="relative aspect-[16/9] bg-ink-100">
              <Image src={item.image} alt="" fill sizes="(max-width: 640px) 50vw, 360px" className="object-cover" />
            </div>
            <div className="p-2 sm:p-3">
              <div className="font-condensed text-[9px] font-semibold uppercase tracking-wide text-maroon-600 sm:text-xs">{item.kicker}</div>
              <h3 className="m-0 mt-1 font-sans text-[11px] font-extrabold text-ink-900 sm:text-base">{item.title}</h3>
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

function confirmLeave(message: string): boolean {
  return window.confirm(message);
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

  const shownReels = reels.slice(0, 2);

  return (
    <section>
      <div className="grid grid-cols-2 gap-3 sm:gap-5">
        <div className="min-w-0">
          <SectionHead title="Our Insta" />
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            {shownReels.map((reel, index) => (
              <a
                key={`${reel.id}-${index}`}
                href={reel.permalink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (!confirmLeave("You're leaving The Maroon Masters to open Instagram. Continue?")) e.preventDefault();
                }}
                className="group relative flex aspect-[9/16] min-h-[140px] flex-col justify-between overflow-hidden rounded-md border border-gold-400 bg-gradient-to-b from-maroon-800 to-ink-900 p-2 text-white shadow-sm sm:min-h-[300px] sm:rounded-lg sm:p-4 sm:shadow-lg"
              >
                {reel.thumbnailUrl && (
                  // Instagram thumbnails are remote URLs, so use a normal image rather than Next Image domain config.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={reel.thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/10 to-maroon-950/90" />
                <div className="relative flex items-center justify-between">
                  <div className="font-condensed text-[9px] font-semibold uppercase tracking-wide text-gold-300 sm:text-xs">Reel</div>
                  <Play size={12} fill="currentColor" className="sm:hidden" />
                  <Play size={16} fill="currentColor" className="hidden sm:block" />
                </div>
                <div className="relative">
                  <h3 className="m-0 line-clamp-2 font-sans text-[10px] font-extrabold sm:text-base">{reel.caption || "Maroon Masters Reel"}</h3>
                </div>
              </a>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <SectionHead title="Our Videos" action="Other Videos" actionHref={ALL_VIDEOS_HREF} />
          <div className="flex flex-col gap-2 sm:gap-4">
            {hypeVideoSlots.map((video) => (
              <a
                key={video.id}
                href={ALL_VIDEOS_HREF}
                onClick={(e) => {
                  if (!confirmLeave("You're leaving The Maroon Masters to view all videos. Continue?")) e.preventDefault();
                }}
                className="group relative flex aspect-[16/9] w-full flex-col justify-between overflow-hidden rounded-md border border-gold-400 bg-gradient-to-b from-maroon-800 to-ink-900 p-2 text-white shadow-sm sm:rounded-lg sm:p-4 sm:shadow-lg"
              >
                {video.thumbnailUrl && (
                  <Image src={video.thumbnailUrl} alt="" fill sizes="(max-width: 640px) 50vw, 360px" className="object-cover" />
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/10 to-maroon-950/90" />
                <div className="relative flex items-center justify-between">
                  <div className="font-condensed text-[9px] font-semibold uppercase tracking-wide text-gold-300 sm:text-xs">Video</div>
                  <Play size={12} fill="currentColor" className="sm:hidden" />
                  <Play size={16} fill="currentColor" className="hidden sm:block" />
                </div>
                <div className="relative">
                  <h3 className="m-0 line-clamp-2 font-sans text-[10px] font-extrabold sm:text-base">{video.caption}</h3>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function HomeDashboard({ nextTournamentOverride }: { nextTournamentOverride: NextTournamentOverride }) {
  return (
    <section className="bg-cream-100">
      <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-7 sm:py-8">
        <MobileHighlightsToggle nextTournamentOverride={nextTournamentOverride} />

        <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(180px,320px)] gap-4 xl:gap-7">
          <HighlightsRail />
          <div className="flex min-w-0 flex-col gap-2 sm:gap-3 xl:gap-4">
            <QuickScheduleCard nextTournamentOverride={nextTournamentOverride} />
            <QuickTeamsCard />
            <QuickLeaderboardCard />
          </div>
        </div>

        <div className="mt-6 space-y-6 sm:mt-10 sm:space-y-10">
          <NewsSection />
          <SocialsSection />
        </div>
      </div>
    </section>
  );
}
