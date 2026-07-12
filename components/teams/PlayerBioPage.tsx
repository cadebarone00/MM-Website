"use client";

import Image from "next/image";
import { ChevronRight, Star } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { SocialLinks } from "@/components/ui/SocialLinks";
import { useFavoritePlayers } from "@/components/teams/useFavoritePlayers";
import type { PlayerProfile, Team } from "@/lib/data/types";

type ProfileTab = "overview" | "career" | "results" | "news" | "stats" | "bio";

const tabs: { value: ProfileTab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "career", label: "Career" },
  { value: "results", label: "Results" },
  { value: "news", label: "News & Video" },
  { value: "stats", label: "Stats" },
  { value: "bio", label: "Bio" },
];

function clean(value?: string | null) {
  if (!value || value.trim().length === 0 || value.trim().toLowerCase() === "na") return "-";
  return value;
}

function StatItem({ value, label }: { value?: string | null; label: string }) {
  return (
    <div className="text-center">
      <div className="font-sans text-2xl font-extrabold text-ink-900">{clean(value)}</div>
      <div className="font-sans text-sm font-bold text-ink-400">{label}</div>
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg bg-ink-50 px-7 py-7">
      <h2 className="m-0 text-center font-sans text-2xl font-extrabold text-ink-900">{title}</h2>
      <div className="my-6 border-t border-ink-200" />
      {children}
    </section>
  );
}

function teamTheme(team: Team) {
  return team === "maroon"
    ? {
        hero: "bg-gradient-to-br from-maroon-900 via-maroon-700 to-ink-700 text-white",
        photo: "bg-maroon-900",
        icon: "border-gold-300/60 text-gold-200",
        rule: "border-gold-300/35",
        muted: "text-maroon-100",
        name: "text-white",
      }
    : {
        hero: "bg-gradient-to-br from-white via-cream-50 to-ink-200 text-ink-900 border border-ink-200",
        photo: "bg-white",
        icon: "border-maroon-200 text-maroon-700 bg-white",
        rule: "border-ink-200",
        muted: "text-ink-600",
        name: "text-ink-900",
      };
}

function ProfileTabs({ active, onChange }: { active: ProfileTab; onChange: (tab: ProfileTab) => void }) {
  return (
    <div className="border-b-[6px] border-ink-200">
      <div role="tablist" aria-label="Player profile sections" className="flex gap-8 overflow-x-auto">
        {tabs.map((tab) => {
          const selected = active === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(tab.value)}
              className={[
                "relative shrink-0 pb-4 font-sans text-xl font-extrabold transition-colors sm:text-2xl",
                selected ? "text-ink-900" : "text-ink-400 hover:text-maroon-700",
              ].join(" ")}
            >
              {tab.label}
              {selected && <span className="absolute -bottom-[6px] left-0 h-[6px] w-full bg-ink-900" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Hero({ profile, team }: { profile: PlayerProfile; team: Team }) {
  const theme = teamTheme(team);
  const { isFavorite, toggleFavorite } = useFavoritePlayers();
  const favorite = isFavorite(profile.id);

  return (
    <section className={["overflow-hidden rounded-lg", theme.hero].join(" ")}>
      <div className="grid min-h-[430px] lg:grid-cols-[minmax(300px,0.42fr)_1fr]">
        <div className={["relative min-h-[340px]", theme.photo].join(" ")}>
          {profile.avatarSrc ? (
            <Image src={profile.avatarSrc} alt={profile.fullName} fill sizes="420px" className="object-cover object-top" priority />
          ) : (
            <div className="flex h-full items-center justify-center font-condensed text-7xl font-bold opacity-30">{profile.fullName.slice(0, 1)}</div>
          )}
        </div>
        <div className="relative px-8 py-9 lg:px-12">
          <div className="absolute right-5 top-5 z-10 flex max-w-[calc(100%-2.5rem)] items-center gap-2">
            <SocialLinks instagram={profile.instagram} linkedin={profile.linkedin} />
          </div>
          <div className="mb-5 flex items-center gap-6 pr-0 pt-12 sm:pr-56 sm:pt-0">
            <button
              type="button"
              aria-pressed={favorite}
              aria-label={favorite ? `Remove ${profile.fullName} from favorites` : `Favorite ${profile.fullName}`}
              onClick={() => toggleFavorite(profile.id)}
              className={[
                "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition-all",
                favorite ? "border-gold-400 bg-gradient-trophy text-maroon-900 shadow-lg" : theme.icon,
              ].join(" ")}
            >
              <Star size={22} fill={favorite ? "currentColor" : "none"} />
            </button>
            <h1 className={["m-0 max-w-[520px] font-sans text-[64px] font-extrabold leading-none tracking-normal", theme.name].join(" ")}>{profile.fullName}</h1>
          </div>
          <div className={["border-t pt-6", theme.rule].join(" ")}>
            <div className="grid gap-5 sm:grid-cols-5">
              <div>
                <div className="font-sans text-sm font-extrabold">Team</div>
                <div className={["mt-2 font-sans text-sm", theme.muted].join(" ")}>{team === "maroon" ? "Maroon" : "White"}</div>
              </div>
              <div>
                <div className="font-sans text-sm font-extrabold">Age</div>
                <div className={["mt-2 font-sans text-sm", theme.muted].join(" ")}>{clean(profile.age)}</div>
              </div>
              <div>
                <div className="font-sans text-sm font-extrabold">Plays From</div>
                <div className={["mt-2 font-sans text-sm", theme.muted].join(" ")}>{clean(profile.playsFrom)}</div>
              </div>
              <div>
                <div className="font-sans text-sm font-extrabold">Birthplace</div>
                <div className={["mt-2 font-sans text-sm", theme.muted].join(" ")}>{clean(profile.birthplace)}</div>
              </div>
              <div>
                <div className="font-sans text-sm font-extrabold">College</div>
                <div className={["mt-2 font-sans text-sm", theme.muted].join(" ")}>{clean(profile.college)}</div>
              </div>
            </div>
          </div>
          <div className={["mt-7 border-t pt-6", theme.rule].join(" ")}>
            <div className="grid gap-6 sm:grid-cols-4">
              <div>
                <div className="font-sans text-sm font-extrabold">Handicap</div>
                <div className="mt-2 font-condensed text-5xl font-bold">{clean(profile.handicap)}</div>
              </div>
              <div>
                <div className="font-sans text-sm font-extrabold">Ranking</div>
                <div className="mt-2 font-condensed text-5xl font-bold">{clean(profile.rankingNotes)}</div>
              </div>
              <div>
                <div className="font-sans text-sm font-extrabold">Debut</div>
                <div className="mt-2 font-condensed text-5xl font-bold">{clean(profile.debut)}</div>
              </div>
              <div>
                <div className="font-sans text-sm font-extrabold">Best Finish</div>
                <div className="mt-2 font-condensed text-5xl font-bold">3rd</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Overview({ profile }: { profile: PlayerProfile }) {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      <section className="rounded-lg bg-ink-50 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="m-0 font-sans text-xl font-extrabold text-ink-900">Career</h2>
            <p className="m-0 mt-1 font-sans text-sm font-bold text-ink-400">Maroon Masters</p>
          </div>
          <ChevronRight className="text-ink-900" size={24} />
        </div>
        <div className="mt-6 space-y-4">
          <StatItem value={profile.debut} label="Debut" />
          <StatItem value="2" label="Top 3s" />
          <StatItem value={profile.handicap} label="Handicap" />
        </div>
      </section>
      <section className="rounded-lg bg-ink-50 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="m-0 font-sans text-xl font-extrabold text-ink-900">Season</h2>
            <p className="m-0 mt-1 font-sans text-sm font-bold text-ink-400">2027</p>
          </div>
          <ChevronRight className="text-ink-900" size={24} />
        </div>
        <div className="mt-6 space-y-4">
          <StatItem value="-" label="Wins" />
          <StatItem value="-" label="Top 5" />
          <StatItem value="-" label="Points" />
        </div>
      </section>
      <section className="rounded-lg bg-ink-50 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="m-0 font-sans text-xl font-extrabold text-ink-900">Bio</h2>
            <p className="m-0 mt-1 font-sans text-sm font-bold text-ink-400">Background</p>
          </div>
          <ChevronRight className="text-ink-900" size={24} />
        </div>
        <div className="mt-6 space-y-4">
          <StatItem value={profile.height} label="Height" />
          <StatItem value={profile.age} label="Age" />
          <StatItem value={profile.status} label="Status" />
        </div>
      </section>
      <section className="rounded-lg bg-ink-50 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="m-0 font-sans text-xl font-extrabold text-ink-900">Stats</h2>
            <p className="m-0 mt-1 font-sans text-sm font-bold text-ink-400">Performance</p>
          </div>
          <ChevronRight className="text-ink-900" size={24} />
        </div>
        <div className="mt-6 space-y-4">
          <StatItem value="Straightest driver" label="Strength" />
          <StatItem value="3rd" label="Best Finish" />
          <StatItem value={profile.rankingNotes} label="Current Rank" />
        </div>
      </section>
    </div>
  );
}

function Bio({ profile }: { profile: PlayerProfile }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <InfoCard title="Physical Stats">
        <div className="grid grid-cols-2 gap-8">
          <StatItem value={profile.height} label="Height" />
          <StatItem value={profile.weight} label="Weight" />
        </div>
      </InfoCard>
      <InfoCard title="Maroon Masters Status">
        <StatItem value={`${clean(profile.handicap)} / ${clean(profile.rankingNotes)}`} label="Handicap / Ranking" />
      </InfoCard>
      <InfoCard title="Location">
        <div className="grid grid-cols-2 gap-x-8 gap-y-10">
          <StatItem value={profile.birthplace} label="Birthplace" />
          <StatItem value={profile.residence} label="Residence" />
          <StatItem value={profile.playsFrom} label="Plays From" />
          <StatItem value={profile.college} label="College" />
        </div>
      </InfoCard>
      <InfoCard title="Personal">
        <div className="grid grid-cols-2 gap-x-8 gap-y-10">
          <StatItem value={profile.age} label="Age" />
          <StatItem value={profile.birthday} label="Birthday" />
          <StatItem value={profile.personal} label="Family" />
          <StatItem value={profile.nickname} label="Nickname" />
        </div>
      </InfoCard>
      <section className="rounded-lg bg-ink-50 px-7 py-7 lg:col-span-2">
        <h2 className="m-0 text-center font-sans text-2xl font-extrabold text-ink-900">Player Bio</h2>
        <div className="my-6 border-t border-ink-200" />
        <p className="mx-auto max-w-[900px] text-center font-sans text-lg leading-relaxed text-ink-700">{profile.bio}</p>
      </section>
    </div>
  );
}

function PlaceholderTab({ title }: { title: string }) {
  return (
    <section className="rounded-lg bg-ink-50 px-7 py-12 text-center">
      <h2 className="m-0 font-sans text-2xl font-extrabold text-ink-900">{title}</h2>
      <p className="mt-3 font-sans text-sm text-ink-500">-</p>
    </section>
  );
}

export function PlayerBioPage({ profile, team }: { profile: PlayerProfile; team: Team }) {
  const [active, setActive] = useState<ProfileTab>("overview");

  return (
    <div>
      <Hero profile={profile} team={team} />
      <div className="mt-8">
        <ProfileTabs active={active} onChange={setActive} />
      </div>
      <div className="mt-8">
        {active === "overview" && <Overview profile={profile} />}
        {active === "career" && <PlaceholderTab title="Career" />}
        {active === "results" && <PlaceholderTab title="Results" />}
        {active === "news" && <PlaceholderTab title="News & Video" />}
        {active === "stats" && <PlaceholderTab title="Stats" />}
        {active === "bio" && <Bio profile={profile} />}
      </div>
    </div>
  );
}
