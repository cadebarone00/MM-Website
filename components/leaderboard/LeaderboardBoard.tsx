"use client";

import { useState } from "react";
import { TeamMatchesBoard } from "./TeamMatchesBoard";
import { IndividualLeaderboardTable } from "./IndividualLeaderboardTable";
import type { Tournament } from "@/lib/data/types";

type View = "team" | "individual";

const VIEWS: { id: View; label: string }[] = [
  { id: "team", label: "Team" },
  { id: "individual", label: "Individual" },
];

export function LeaderboardBoard({ tournament, live }: { tournament: Tournament; live: boolean }) {
  const [view, setView] = useState<View>("team");

  return (
    <div>
      <div className="mb-4 inline-flex gap-[2px] rounded-md border border-ink-100 bg-cream-100 p-1 sm:mb-6">
        {VIEWS.map(({ id, label }) => {
          const on = view === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={[
                "inline-flex items-center rounded-sm px-4 py-1.5 font-condensed text-xs font-semibold uppercase tracking-wide transition-colors duration-200 sm:px-6 sm:py-2 sm:text-sm",
                on ? "bg-maroon-700 text-cream-50" : "bg-transparent text-ink-500 hover:text-maroon-700",
              ].join(" ")}
            >
              {label}
            </button>
          );
        })}
      </div>

      {view === "team" ? <TeamMatchesBoard tournament={tournament} live={live} /> : <IndividualLeaderboardTable tournament={tournament} />}
    </div>
  );
}
