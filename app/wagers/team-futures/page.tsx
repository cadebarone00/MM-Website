"use client";

import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { CategoryPageShell } from "@/components/wagers/CategoryPageShell";
import { TeamFuturesCard } from "@/components/wagers/TeamFuturesCard";

export default function TeamFuturesPage() {
  const { tournament, loading, payload } = useLiveTournament();

  if (loading && !payload) {
    return <p className="px-4 py-10 text-center font-sans text-sm text-ink-400 sm:px-7">Checking the live sheet...</p>;
  }

  return (
    <CategoryPageShell
      rulesText="Pick which team wins the tournament overall. A wager locks in the odds shown at the moment you place it; payouts use standard American odds."
      searchPlaceholder="Search Maroon or White..."
    >
      {(search) => {
        const term = search.trim().toLowerCase();
        const visible = term === "" || "maroon".includes(term) || "white".includes(term) || "team winner".includes(term);
        return visible ? (
          <TeamFuturesCard tournament={tournament} />
        ) : (
          <p className="font-sans text-sm text-ink-400">No markets match &ldquo;{search}&rdquo;.</p>
        );
      }}
    </CategoryPageShell>
  );
}
