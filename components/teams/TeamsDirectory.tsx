"use client";

import Link from "next/link";
import { BarChart3, Star } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { MaroonCollage } from "@/components/teams/MaroonCollage";
import { useFavoritePlayers } from "@/components/teams/useFavoritePlayers";
import { getPlayerAvatar, getPlayerDisplayName, getPlayerProfile } from "@/lib/data/players";
import { StatsTab } from "@/components/teams/StatsTab";
import type { Team, Tournament } from "@/lib/data/types";

type View = Team | "rankings" | "stats";

const views: { value: View; label: string }[] = [
  { value: "maroon", label: "Maroon" },
  { value: "white", label: "White" },
  { value: "rankings", label: "Rankings" },
  { value: "stats", label: "Stats" },
];

function playerHref(tournamentSlug: string, player: string) {
  return `/leaderboard/${tournamentSlug}/players/${encodeURIComponent(player.toLowerCase())}`;
}

function teamLabel(team: Team) {
  return team === "maroon" ? "Team Maroon" : "Team White";
}

function PlayerRow({
  name,
  team,
  rank,
  toPar,
  showBioAndScore = true,
  favorite = false,
}: {
  name: string;
  team: Team;
  rank?: number;
  toPar?: number;
  showBioAndScore?: boolean;
  favorite?: boolean;
}) {
  const displayName = getPlayerDisplayName(name);
  const avatar = getPlayerAvatar(name);

  const info = (
    <div className="grid grid-cols-[72px_1fr_auto] items-center gap-4 sm:grid-cols-[88px_1fr_auto] sm:gap-6">
      <Avatar
        src={avatar}
        name={displayName}
        team={team}
        size="xl"
        className="h-[72px] w-[72px] border border-ink-100 bg-white text-ink-400 sm:h-[88px] sm:w-[88px]"
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {rank != null && <span className="font-condensed text-lg font-bold text-maroon-700 tabular-nums">#{rank}</span>}
          <h2 className="m-0 truncate font-sans text-xl font-extrabold text-ink-900 sm:text-2xl">{displayName}</h2>
          {favorite && <Star size={18} fill="currentColor" className="shrink-0 text-gold-500" aria-label="Favorited player" />}
        </div>
        <div
          className={[
            "mt-1 font-condensed text-xs font-semibold uppercase tracking-wide",
            team === "maroon" ? "text-maroon-600" : "text-ink-500",
          ].join(" ")}
        >
          {teamLabel(team)}
        </div>
      </div>
      {showBioAndScore && toPar != null && <ScoreBadge value={toPar} size="md" chip className="hidden shrink-0 sm:inline-flex" />}
    </div>
  );

  return showBioAndScore ? (
    <Link
      href={playerHref(team, name)}
      className="block border-b-2 border-maroon-700 py-5 transition-colors hover:bg-maroon-50/50 sm:py-6"
    >
      {info}
    </Link>
  ) : (
    <div className="border-b-2 border-maroon-700 py-5 sm:py-6">{info}</div>
  );
}

export function TeamsDirectory({ tournament }: { tournament: Tournament }) {
  const [view, setView] = useState<View>("maroon");
  const { isFavorite } = useFavoritePlayers();
  const players = [
    ...tournament.roster.maroon.map((name) => ({ name, team: "maroon" as Team })),
    ...tournament.roster.white.map((name) => ({ name, team: "white" as Team })),
  ];
  const alphaPlayers = players
    .filter((player) => (view === "maroon" || view === "white") && player.team === view)
    .sort((a, b) => {
      const aFavorite = isFavorite(a.name);
      const bFavorite = isFavorite(b.name);
      if (aFavorite !== bFavorite) return aFavorite ? -1 : 1;
      return getPlayerDisplayName(a.name).localeCompare(getPlayerDisplayName(b.name));
    });
  const rankedPlayers = [...tournament.individualLeaderboard]
    .sort((a, b) => a.toPar - b.toPar || getPlayerDisplayName(a.player).localeCompare(getPlayerDisplayName(b.player)))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  return (
    <section className="mt-8">
      <div className="mb-7 border-b-[6px] border-ink-200">
        <div role="tablist" aria-label="Team roster views" className="flex gap-8 overflow-x-auto">
          {views.map((item) => {
            const active = view === item.value;
            return (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setView(item.value)}
                className={[
                  "relative shrink-0 pb-4 font-sans text-xl font-extrabold transition-colors sm:text-2xl",
                  active ? "text-ink-900" : "text-ink-400 hover:text-maroon-700",
                ].join(" ")}
              >
                {item.label}
                {active && <span className="absolute -bottom-[6px] left-0 h-[6px] w-full bg-maroon-700" />}
              </button>
            );
          })}
        </div>
      </div>

      {view === "rankings" ? (
        <div>
          <div className="mb-2 flex items-center gap-2 font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500">
            <BarChart3 size={16} />
            Individual rankings
          </div>
          {rankedPlayers.map((player) => (
            <PlayerRow
              key={player.player}
              name={player.player}
              team={player.team}
              rank={player.rank}
              showBioAndScore={false}
            />
          ))}
        </div>
      ) : view === "stats" ? (
        <StatsTab tournament={tournament} />
      ) : (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div>
            {alphaPlayers.map((player) => (
              <PlayerRow key={player.name} name={player.name} team={player.team} favorite={isFavorite(player.name)} />
            ))}
          </div>
          {view === "maroon" && <MaroonCollage />}
        </div>
      )}
    </section>
  );
}
