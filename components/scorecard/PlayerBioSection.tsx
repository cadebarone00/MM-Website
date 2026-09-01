"use client";

import { useEffect, useState } from "react";
import { SocialLinks } from "@/components/ui/SocialLinks";
import type { PlayerProfile } from "@/lib/data/types";

// The data files use a literal "-" to mark a field as not filled in yet — treat that as absent, same as empty.
function isSet(value?: string | null): value is string {
  return !!value && value.trim() !== "" && value.trim() !== "-";
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!isSet(value)) return null;
  return (
    <div>
      <div className="font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-ink-400">{label}</div>
      <div className="mt-0.5 font-sans text-sm text-ink-900">{value}</div>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value?: string | null }) {
  if (!isSet(value)) return null;
  return (
    <div>
      <div className="font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-ink-400">{label}</div>
      <div className="mt-1 font-sans text-sm leading-relaxed text-ink-700">{value}</div>
    </div>
  );
}

/**
 * The merged "one bio per player" section — replaces the separate bio page
 * that used to live at /teams/[team]/[player]. Everything real from that
 * profile (background, location, golf details, personal notes, career
 * highlights, and the full write-up) lives here now, directly below the
 * Statistics section on this same page.
 *
 * Fetches this player's approved edits (see the Player Bio Portal spec)
 * client-side on mount and overlays them on the static baseline — this
 * works identically whether the page rendered statically or client-side
 * (the live tournament path), so no parent component needs to change.
 */
export function PlayerBioSection({ profile: baseProfile }: { profile: PlayerProfile | undefined }) {
  const [profile, setProfile] = useState(baseProfile);

  useEffect(() => {
    setProfile(baseProfile);
    if (!baseProfile) return;
    let cancelled = false;
    fetch(`/api/players/${baseProfile.slug}/overrides`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.ok) return;
        setProfile((current) => (current ? { ...current, ...data.overrides } : current));
      })
      .catch(() => {
        // Overrides are an enhancement, not required for the page to work —
        // a failed fetch just leaves the static baseline showing.
      });
    return () => {
      cancelled = true;
    };
  }, [baseProfile]);

  if (!profile) return null;

  const hasNotes = [profile.strengths, profile.careerHighlights, profile.personal, profile.hobbies, profile.goals, profile.misc].some(isSet);

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="m-0 font-serif text-2xl font-bold text-maroon-700">Player Bio</h2>
        {(profile.instagram || profile.linkedin) && <SocialLinks instagram={profile.instagram} linkedin={profile.linkedin} />}
      </div>

      <div className="rounded-md border border-ink-100 bg-white p-5">
        {isSet(profile.bio) && <p className="mb-5 font-sans text-sm leading-relaxed text-ink-700">{profile.bio}</p>}

        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <InfoRow label="Class Year" value={profile.classYear} />
          <InfoRow label="Major" value={profile.major} />
          <InfoRow label="Occupation" value={profile.occupation} />
          <InfoRow label="Hometown" value={profile.hometown} />
          <InfoRow label="College" value={profile.college} />
          <InfoRow label="Residence" value={profile.residence} />
          <InfoRow label="Plays From" value={profile.playsFrom} />
          <InfoRow label="Status" value={profile.status} />
          <InfoRow label="Handicap" value={profile.handicap} />
          <InfoRow label="Ranking" value={profile.rankingNotes} />
          <InfoRow label="Club Golf" value={profile.clubGolfYears} />
          <InfoRow label="Debut" value={profile.debut} />
          <InfoRow label="Debut Location" value={profile.debutLocation} />
          <InfoRow label="Height" value={profile.height} />
          <InfoRow label="Weight" value={profile.weight} />
          <InfoRow label="Age" value={profile.age} />
          <InfoRow label="Birthday" value={profile.birthday} />
          <InfoRow label="Nickname" value={profile.nickname} />
        </div>

        {hasNotes && (
          <div className="mt-5 grid gap-4 border-t border-ink-100 pt-5 sm:grid-cols-2">
            <InfoBlock label="Strengths" value={profile.strengths} />
            <InfoBlock label="Career Highlights" value={profile.careerHighlights} />
            <InfoBlock label="Family" value={profile.personal} />
            <InfoBlock label="Hobbies" value={profile.hobbies} />
            <InfoBlock label="Goals" value={profile.goals} />
            <InfoBlock label="Misc" value={profile.misc} />
          </div>
        )}

        {profile.history && profile.history.length > 0 && (
          <div className="mt-5 border-t border-ink-100 pt-5">
            <div className="mb-2 font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-ink-400">Maroon Masters History</div>
            <ul className="m-0 space-y-1 pl-5">
              {profile.history.map((h, i) => (
                <li key={i} className="font-sans text-sm text-ink-700">
                  {h}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
