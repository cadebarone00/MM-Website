"use client";

import { useState } from "react";
import { getPlayerDisplayName } from "@/lib/data/players";
import { formatRoundLabel } from "@/lib/data/roundLabel";
import type { RoundFormatEntry } from "@/lib/data/roundFormatArchive";
import type { OrphanArchivedRound } from "@/lib/data/archivedScorecards";
import { Tabs } from "@/components/ui/Tabs";

export interface RoundFormatTournament {
  slug: string;
  editionLabel: string;
  entries: RoundFormatEntry[];
  orphans: OrphanArchivedRound[];
}

function names(slugs: string[]): string {
  return slugs.map(getPlayerDisplayName).join(" & ");
}

/**
 * "Above everything we have in there already" per Cade (2026-09-14): the
 * canonical, no-confusion reference for which round was played on which
 * day of which year, in what format, and who played whom — pulled
 * straight from each tournament's own match schedule (never
 * hand-reconciled) plus any archived round outside that schedule (like
 * 2025's Round INDI).
 */
export function RoundFormatArchive({ tournaments }: { tournaments: RoundFormatTournament[] }) {
  const [slug, setSlug] = useState(tournaments[0]?.slug);
  const active = tournaments.find((t) => t.slug === slug) ?? tournaments[0];
  if (!active) return null;

  return (
    <section className="rounded-xl border-2 border-gold-300 bg-cream-50 p-4 sm:p-5">
      <h2 className="font-serif text-2xl font-bold text-ink-900">Round &amp; Format Archive</h2>
      <p className="mt-1 font-sans text-sm text-ink-500">The source of truth for which round was which day, format, and matchup — every year, straight from the schedule.</p>
      <div className="mt-4"><Tabs items={tournaments.map((t) => ({ value: t.slug, label: t.editionLabel }))} value={slug} onChange={setSlug} /></div>

      {active.entries.length === 0 && active.orphans.length === 0 ? (
        <p className="mt-4 font-sans text-sm text-ink-500">No rounds recorded yet for this year.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {active.entries.map((entry) => (
            <article key={entry.round} className="rounded-lg border border-gold-200 bg-white p-3">
              <p className="font-condensed text-xs font-bold uppercase tracking-wide text-maroon-700">
                {formatRoundLabel(entry.round)} · Day {entry.day} {entry.session} · {entry.format}
              </p>
              <ul className="mt-2 flex flex-col gap-1 font-sans text-sm text-ink-900">
                {entry.matchups.map((matchup, i) => (
                  <li key={i}>
                    {names(matchup.side)} <span className="text-ink-400">vs</span> {names(matchup.opponent)}
                  </li>
                ))}
              </ul>
            </article>
          ))}
          {active.orphans.map((orphan) => (
            <article key={orphan.round} className="rounded-lg border border-gold-200 bg-white p-3">
              <p className="font-condensed text-xs font-bold uppercase tracking-wide text-maroon-700">
                {formatRoundLabel(orphan.round)} · {orphan.format ?? "Format not set"}
              </p>
              <p className="mt-1 font-sans text-xs text-ink-500">Not part of the Maroon-vs-White match play schedule.</p>
              <p className="mt-2 font-sans text-sm text-ink-900">{names(orphan.players)}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
