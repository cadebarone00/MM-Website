"use client";

import Image from "next/image";
import { MessageCircle, Video } from "lucide-react";
import { useState } from "react";
import { RoundCountdown } from "@/components/ui/RoundCountdown";

type Tab = "comments" | "highlights";

const tabs: { id: Tab; label: string }[] = [
  { id: "comments", label: "Comments" },
  { id: "highlights", label: "Highlights" },
];

/**
 * Set this to the YouTube video ID for the scheduled/live broadcast (not the
 * whole YouTube URL). Until it is set, the page retains the custom countdown
 * state rather than showing an inactive player.
 */
const YOUTUBE_LIVE_VIDEO_ID = process.env.NEXT_PUBLIC_YOUTUBE_LIVE_VIDEO_ID || null;

export function WatchLiveExperience() {
  const [activeTab, setActiveTab] = useState<Tab>("comments");

  return (
    <main>
      <section className="mx-auto w-full max-w-[1200px] bg-ink-900">
        {YOUTUBE_LIVE_VIDEO_ID ? (
          <iframe
            className="aspect-video w-full"
            src={`https://www.youtube-nocookie.com/embed/${YOUTUBE_LIVE_VIDEO_ID}?rel=0`}
            title="Maroon Masters live broadcast"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <div className="relative aspect-video w-full overflow-hidden bg-ink-900">
            <Image src="/loading/mobile.png" alt="" fill priority sizes="100vw" className="object-cover lg:hidden" />
            <Image src="/loading/desktop.png" alt="" fill priority sizes="(max-width: 1200px) 100vw, 1200px" className="hidden object-cover lg:block" />
            <div className="absolute inset-0 flex items-center justify-center bg-maroon-900/20 px-4 text-center">
              <div className="flex flex-col items-center">
                <p className="mb-2 font-condensed text-xs font-bold uppercase tracking-eyebrow text-white sm:text-sm">Maroon Masters On The Range</p>
                <div className="flex min-w-[190px] justify-center rounded-sm border border-white/30 bg-maroon-900/75 px-5 py-3 text-cream-50 shadow-md sm:min-w-[270px]">
                  <RoundCountdown className="w-full text-center" />
                </div>
                <p className="mt-2 font-condensed text-xs font-bold uppercase tracking-eyebrow text-white sm:text-sm">January 5th 2027</p>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="mx-auto max-w-[720px] px-4 pb-12 pt-6 sm:px-7 sm:pt-8">
        <div className="flex justify-center border-b border-ink-200" role="tablist" aria-label="Watch live content">
          {tabs.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "relative px-5 pb-3 font-condensed text-sm font-bold uppercase tracking-wide transition-colors",
                  selected ? "text-maroon-700" : "text-ink-400 hover:text-ink-700",
                ].join(" ")}
              >
                {tab.label}
                {selected && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-maroon-700" />}
              </button>
            );
          })}
        </div>

        <div className="pt-8" role="tabpanel">
          {activeTab === "comments" ? <CommentsPanel /> : <HighlightsPanel />}
        </div>
      </section>
    </main>
  );
}

function CommentsPanel() {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-md border border-ink-100 bg-white px-6 text-center shadow-xs">
      <MessageCircle size={22} className="text-maroon-700" aria-hidden="true" />
      <p className="m-0 font-serif text-lg font-semibold text-ink-900">Join the conversation</p>
      <p className="m-0 max-w-sm text-sm text-ink-500">Live comments will appear here during the broadcast.</p>
    </div>
  );
}

function HighlightsPanel() {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-md border border-ink-100 bg-white px-6 text-center shadow-xs">
      <Video size={22} className="text-maroon-700" aria-hidden="true" />
      <p className="m-0 font-serif text-lg font-semibold text-ink-900">Broadcast highlights</p>
      <p className="m-0 max-w-sm text-sm text-ink-500">Key moments from the round will be collected here.</p>
    </div>
  );
}
