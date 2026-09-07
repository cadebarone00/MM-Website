"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { MaroonCollage } from "@/components/teams/MaroonCollage";
import { useFavoritePlayers } from "@/components/teams/useFavoritePlayers";
import { getPlayerAvatar, getPlayerDisplayName, getPlayerProfile, playerProfiles } from "@/lib/data/players";
import type { Team, Tournament } from "@/lib/data/types";

type View = Team | "unassigned";

// Unassigned covers the club's players who aren't on either team's roster
// for this tournament.
const views: { value: View; label: string }[] = [
  { value: "maroon", label: "Maroon" },
  { value: "white", label: "White" },
  { value: "unassigned", label: "Unassigned" },
];

function playerHref(tournamentSlug: string, player: string) {
  return `/leaderboard/${tournamentSlug}/players/${encodeURIComponent(player.toLowerCase())}`;
}

function PlayerRow({
  name,
  team,
  tournamentSlug,
  showBioAndScore = true,
  favorite = false,
}: {
  name: string;
  team: Team | null;
  tournamentSlug: string;
  showBioAndScore?: boolean;
  favorite?: boolean;
}) {
  const displayName = getPlayerDisplayName(name);
  const avatar = getPlayerAvatar(name);

  const info = (
    <div className="grid grid-cols-[36px_1fr] items-center gap-5 lg:grid-cols-[56px_1fr] lg:gap-6">
      {/* Avatar's own size prop sets a fixed inline width/height, which a
          plain className override can't beat — so the mobile-vs-desktop
          sizes are two instances swapped by `hidden`/`lg:hidden` wrapper
          spans (toggling display on Avatar's own element would fight its
          baked-in `inline-flex`), each with its own explicit style. */}
      <div>
        <span className="inline-block lg:hidden">
          <Avatar
            src={avatar}
            name={displayName}
            team={team}
            size="xl"
            className="border border-ink-100 bg-white text-ink-400"
            style={{ width: 36, height: 36, fontSize: 14 }}
          />
        </span>
        <span className="hidden lg:inline-block">
          <Avatar
            src={avatar}
            name={displayName}
            team={team}
            size="xl"
            className="border border-ink-100 bg-white text-ink-400"
            style={{ width: 56, height: 56, fontSize: 22 }}
          />
        </span>
      </div>
      <div className="flex min-w-0 flex-nowrap items-center gap-x-2 lg:gap-x-3">
        <h2 className="m-0 min-w-0 flex-1 truncate font-sans text-base font-extrabold text-ink-900 lg:text-xl">{displayName}</h2>
        {favorite && <Star size={18} fill="currentColor" className="shrink-0 text-gold-500" aria-label="Favorited player" />}
      </div>
    </div>
  );

  return showBioAndScore ? (
    <Link
      href={playerHref(tournamentSlug, name)}
      className="block border-b-2 border-maroon-700 py-3 transition-colors hover:bg-maroon-50/50 lg:py-5"
    >
      {info}
    </Link>
  ) : (
    <div className="border-b-2 border-maroon-700 py-3 lg:py-5">{info}</div>
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
  const rosterSlugs = new Set(
    [...tournament.roster.maroon, ...tournament.roster.white]
      .map((name) => getPlayerProfile(name)?.slug)
      .filter((slug): slug is string => Boolean(slug))
  );
  const unassignedPlayers = playerProfiles
    .filter((profile) => !rosterSlugs.has(profile.slug))
    .sort((a, b) => {
      const aFavorite = isFavorite(a.id);
      const bFavorite = isFavorite(b.id);
      if (aFavorite !== bFavorite) return aFavorite ? -1 : 1;
      return a.fullName.localeCompare(b.fullName);
    });

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

      {view === "unassigned" ? (
        <div>
          {unassignedPlayers.map((player) => (
            <PlayerRow
              key={player.slug}
              name={player.id}
              team={null}
              tournamentSlug={tournament.slug}
              showBioAndScore={false}
              favorite={isFavorite(player.id)}
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div>
            {alphaPlayers.map((player) => (
              <PlayerRow
                key={player.name}
                name={player.name}
                team={player.team}
                tournamentSlug={tournament.slug}
                favorite={isFavorite(player.name)}
              />
            ))}
          </div>
          {view === "maroon" && <MaroonCollage />}
        </div>
      )}
    </section>
  );
}
