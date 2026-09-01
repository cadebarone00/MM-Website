"use client";

import { MessageCircle, Video } from "lucide-react";
import { useState } from "react";

type Tab = "comments" | "highlights";

const tabs: { id: Tab; label: string }[] = [
  { id: "comments", label: "Comments" },
  { id: "highlights", label: "Highlights" },
];

/**
 * The broadcast URL will be supplied when the production stream is ready.
 * Keeping the empty state inside the player preserves the final layout while
 * avoiding an inactive browser video control surface before then.
 */
const LIVE_STREAM_URL = process.env.NEXT_PUBLIC_LIVE_STREAM_URL || null;

export function WatchLiveExperience() {
  const [activeTab, setActiveTab] = useState<Tab>("comments");

  return (
    <main>
      <section className="mx-auto w-full max-w-[1200px] bg-ink-900">
        {LIVE_STREAM_URL ? (
          <video className="aspect-video w-full" controls playsInline src={LIVE_STREAM_URL} />
        ) : (
          <div className="aspect-video w-full bg-ink-900 text-cream-50">
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-white/10">
                <Video size={22} aria-hidden="true" />
              </span>
              <div>
                <p className="m-0 font-condensed text-sm font-semibold uppercase tracking-eyebrow">Live broadcast</p>
                <p className="mt-1 mb-0 text-xs text-cream-200/70">The stream will appear here when coverage begins.</p>
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
