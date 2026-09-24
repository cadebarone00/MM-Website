"use client";

import { useEffect, useState, type ReactNode } from "react";

export type FantasyTab = "roster" | "leaderboard" | "how-to-play";

const TABS: { id: FantasyTab; label: string }[] = [
  { id: "roster", label: "My Roster" },
  { id: "leaderboard", label: "Leaderboard" },
  { id: "how-to-play", label: "How To Play" },
];

/**
 * The Y position where the site's top chrome ends — PlayerAreaNav's
 * Website/Portal/Scoring switcher when it's showing (player/host sessions),
 * otherwise just the main header. Mirrors PlayerAreaNav's own
 * useHeaderOffset() technique (measure, then re-measure on resize) so this
 * shell's fixed mobile card sits flush against whatever's actually on
 * screen above it, fan or player session alike.
 */
function useTopChromeOffset(): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    function measure() {
      const el = document.querySelector<HTMLElement>("[data-player-area-nav]") ?? document.querySelector<HTMLElement>("header");
      setOffset(el ? el.getBoundingClientRect().bottom : 0);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return offset;
}

/**
 * The permanent "Maroon Masters Fantasy" chrome for every state of the
 * /fantasy page: a full-bleed maroon hero on mobile (flush against the site
 * header/PlayerAreaNav above and the site's bottom tab bar below, edge to
 * edge left/right), centered to a fixed-width column on desktop. My Roster
 * shows whatever state the page is in (welcome/drafting/your team/closed);
 * How To Play is always the same static rules panel.
 */
export function FantasyShell({ activeTab, onTabChange, children }: { activeTab: FantasyTab; onTabChange: (tab: FantasyTab) => void; children: ReactNode }) {
  const top = useTopChromeOffset();

  return (
    <div
      className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom)+2.5vh)] flex flex-col overflow-hidden bg-white lg:static lg:inset-auto lg:mx-auto lg:my-8 lg:w-[40%] lg:min-w-[380px] lg:max-w-[520px] lg:overflow-visible lg:rounded-md lg:border lg:border-ink-100"
      style={{ top }}
    >
      <div className="mx-2 mt-1 flex min-h-24 shrink-0 items-center justify-center rounded-md border-2 border-gold-500 bg-maroon-700 px-4 text-center">
        <h1 className="m-0 font-serif text-lg font-bold uppercase tracking-wide text-white">Maroon Masters Fantasy</h1>
      </div>

      <div role="tablist" aria-label="Fantasy" className="flex shrink-0 justify-center border-b border-ink-200 bg-white">
        {TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onTabChange(tab.id)}
              className={[
                "relative px-5 py-3 font-condensed text-sm font-bold uppercase tracking-wide transition-colors",
                selected ? "text-maroon-700" : "text-ink-400 hover:text-ink-700",
              ].join(" ")}
            >
              {tab.label}
              {selected && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-maroon-700" />}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto bg-white px-4 py-4">
        {children}
      </div>
    </div>
  );
}
