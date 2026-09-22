"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getPlayerDisplayName } from "@/lib/data/players";
import { formatRoundLabel } from "@/lib/data/roundLabel";
import { groupRoundFormatArchiveByDay, type RoundFormatEntry, type RoundFormatMatchup } from "@/lib/data/roundFormatArchive";
import type { OrphanArchivedRound } from "@/lib/data/archivedScorecards";
import type { HandicapCourseOption } from "@/lib/handicap/types";
import { RoundFormatSetupForm } from "./RoundFormatSetupForm";

export interface RoundFormatTournament {
  slug: string;
  year: number;
  venue: string;
  entries: RoundFormatEntry[];
  orphans: OrphanArchivedRound[];
  dayDates: Record<number, string>;
}

function names(slugs: string[]): string[] {
  return slugs.map(getPlayerDisplayName);
}

function dateLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * A single match's box — Fourball/Alt Shot get the full 2-per-side card;
 * Singles gets a narrower one sized to just the two opponents, per Cade
 * (2026-09-14). A matchup with an empty side never played out as a real
 * match (e.g. 2024 Round 7: Luke couldn't play, no points awarded) — shown
 * as a single name with no "vs", not a match result, per Cade (2026-09-15).
 */
function MatchBox({ matchup }: { matchup: RoundFormatMatchup }) {
  const solo = matchup.side.length === 0 || matchup.opponent.length === 0;
  const singles = !solo && matchup.side.length === 1 && matchup.opponent.length === 1;
  if (solo) {
    const player = names([...matchup.side, ...matchup.opponent])[0];
    return (
      <div className="mx-auto w-fit rounded-lg border border-gold-200 bg-white p-3 text-center">
        <p className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-400">{matchup.teeTime ?? "Tee time N/A"}</p>
        <p className="mt-2 font-sans text-sm font-semibold text-ink-900 whitespace-nowrap">{player}</p>
        <p className="mt-1 font-condensed text-3xs font-bold uppercase tracking-wide text-ink-400">No match played — no points awarded</p>
      </div>
    );
  }
  return (
    <div className={`rounded-lg border border-gold-200 bg-white p-3 ${singles ? "mx-auto w-fit" : ""}`}>
      <p className="text-center font-condensed text-2xs font-bold uppercase tracking-wide text-ink-400">{matchup.teeTime ?? "Tee time N/A"}</p>
      <div className={`mt-2 flex items-center gap-3 ${singles ? "" : "justify-between"}`}>
        <div className={singles ? "" : "flex-1 text-right"}>
          {names(matchup.side).map((name) => (
            <p key={name} className="font-sans text-sm font-semibold text-maroon-700 whitespace-nowrap">{name}</p>
          ))}
        </div>
        <span className="shrink-0 font-condensed text-2xs font-bold uppercase text-ink-400">vs</span>
        <div className={singles ? "" : "flex-1"}>
          {names(matchup.opponent).map((name) => (
            <p key={name} className="font-sans text-sm font-semibold text-ink-900 whitespace-nowrap">{name}</p>
          ))}
        </div>
      </div>
    </div>
  );
  return matchup.href ? <Link href={matchup.href} className="block rounded-lg focus-visible:outline-2 focus-visible:outline-maroon-700 hover:brightness-95">{content}</Link> : content;
}

function SetupDetails({ seasonYear, round, setup, courses }: { seasonYear: number; round: number; setup: RoundFormatEntry["setup"]; courses: HandicapCourseOption[] }) {
  if (!setup) return <RoundFormatSetupForm seasonYear={seasonYear} round={round} courses={courses} />;
  return <p className="mt-2 font-sans text-xs text-ink-600">{setup.courseName} &middot; {setup.teeSetup.teeSetName} &middot; Rating {setup.teeSetup.rating ?? "Pending"} / Slope {setup.teeSetup.slope ?? "Pending"} &middot; {dateLabel(setup.datePlayed)}</p>;
}

function SessionBox({ session, entry, seasonYear, courses }: { session: "Morning" | "Afternoon"; entry: RoundFormatEntry | null; seasonYear: number; courses: HandicapCourseOption[] }) {
  return (
    <div className="flex-1 rounded-xl border border-gold-300 bg-cream-50 p-3">
      <p className="font-condensed text-xs font-bold uppercase tracking-wide text-maroon-700">
        {session}
        {entry && <span className="text-ink-500"> · {formatRoundLabel(entry.round)} · {entry.format}</span>}
      </p>
      {entry && <SetupDetails seasonYear={seasonYear} round={entry.round} setup={entry.setup} courses={courses} />}
      {!entry ? (
        <p className="mt-2 font-sans text-sm text-ink-400">No Rounds Played</p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {entry.matchups.map((matchup, i) => (
            <MatchBox key={i} matchup={matchup} />
          ))}
        </div>
      )}
    </div>
  );
}

/** "Day N · date" pill that expands to show the other days (plus a trailing "INDI" entry when the tournament has one) on tap — same interaction as the public leaderboard's day selector. */
function DaySelector({ options, activeKey, onSelect }: { options: { key: string; label: string }[]; activeKey: string; onSelect: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const active = options.find((o) => o.key === activeKey) ?? options[0];

  useEffect(() => {
    if (!open) return;
    function closeWhenClickedOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", closeWhenClickedOutside);
    return () => document.removeEventListener("mousedown", closeWhenClickedOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="mb-3 inline-flex flex-wrap rounded-pill border border-gold-400 bg-white p-[3px]">
      <button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="rounded-pill bg-maroon-700 px-3 py-1 font-condensed text-2xs font-bold uppercase tracking-wide text-cream-50">
        {active?.label}
      </button>
      <div className={["flex flex-wrap overflow-hidden transition-[max-width,opacity,margin] duration-200 ease-out", open ? "ml-1 max-w-[600px] opacity-100" : "max-w-0 opacity-0"].join(" ")}>
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={option.key === activeKey}
            onClick={() => { onSelect(option.key); setOpen(false); }}
            className={`shrink-0 rounded-pill px-3 py-1 font-condensed text-2xs font-bold tabular-nums transition-colors ${option.key === activeKey ? "bg-maroon-700 text-cream-50" : "text-ink-500 hover:bg-cream-100"}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function YearArchive({ tournament, courses }: { tournament: RoundFormatTournament; courses: HandicapCourseOption[] }) {
  const days = groupRoundFormatArchiveByDay(tournament.entries, tournament.dayDates);
  const dayOptions = days.map((d) => ({ key: String(d.day), label: tournament.dayDates[d.day] ? `Day ${d.day} · ${dateLabel(tournament.dayDates[d.day])}` : `Day ${d.day}` }));
  // Round INDI never fits the Day/Morning/Afternoon structure — no day, no
  // opponent — so it's tacked on as its own trailing option instead
  // (per Cade, 2026-09-14: "off to the side or the last selection").
  const options = tournament.orphans.length ? [...dayOptions, { key: "INDI", label: "Round INDI" }] : dayOptions;
  const [activeKey, setActiveKey] = useState(options[0]?.key);

  if (options.length === 0) return <p className="mt-4 font-sans text-sm text-ink-500">No rounds recorded yet for this year.</p>;

  if (activeKey === "INDI") {
    return (
      <div>
        <DaySelector options={options} activeKey={activeKey} onSelect={setActiveKey} />
        {tournament.orphans.map((orphan) => (
          <div key={orphan.round} className="rounded-xl border border-gold-300 bg-cream-50 p-3">
            <p className="font-condensed text-xs font-bold uppercase tracking-wide text-maroon-700">{formatRoundLabel(orphan.round)} · {orphan.format ?? "Format not set"}</p>
            <SetupDetails seasonYear={tournament.year} round={orphan.round} setup={orphan.setup} courses={courses} />
            <p className="mt-1 font-sans text-xs text-ink-500">Not part of the Maroon-vs-White match play schedule.</p>
            <p className="mt-2 font-sans text-sm text-ink-900">{names(orphan.players).join(", ")}</p>
          </div>
        ))}
      </div>
    );
  }

  const activeDay = days.find((d) => String(d.day) === activeKey) ?? days[0];
  return (
    <div>
      <DaySelector options={options} activeKey={activeKey} onSelect={setActiveKey} />
      <div className="flex flex-col gap-3 sm:flex-row">
        <SessionBox session="Morning" entry={activeDay.morning} seasonYear={tournament.year} courses={courses} />
        <SessionBox session="Afternoon" entry={activeDay.afternoon} seasonYear={tournament.year} courses={courses} />
      </div>
    </div>
  );
}

/**
 * "Above everything we have in there already" per Cade (2026-09-14): the
 * canonical, no-confusion reference for which round was played on which
 * day of which year, in what format, and who played whom — pulled
 * straight from each tournament's own match schedule (never
 * hand-reconciled) plus any archived round outside that schedule (like
 * 2025's Round INDI).
 */
export function RoundFormatArchive({ tournaments, courses }: { tournaments: RoundFormatTournament[]; courses: HandicapCourseOption[] }) {
  const [slug, setSlug] = useState(tournaments[0]?.slug);
  const active = tournaments.find((t) => t.slug === slug) ?? tournaments[0];
  if (!active) return null;

  return (
    <section className="rounded-xl border-2 border-gold-300 bg-cream-50 p-4 sm:p-5">
      <h2 className="font-serif text-2xl font-bold text-ink-900">Round &amp; Format Archive</h2>
      <p className="mt-1 font-sans text-sm text-ink-500">The source of truth for which round was which day, format, and matchup — every year, straight from the schedule.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {tournaments.map((t) => (
          <button
            key={t.slug}
            type="button"
            aria-pressed={t.slug === slug}
            onClick={() => setSlug(t.slug)}
            className={`rounded-pill border px-3 py-1.5 font-condensed text-xs font-bold uppercase tracking-wide ${t.slug === slug ? "border-maroon-700 bg-maroon-700 text-cream-50" : "border-gold-300 bg-white text-ink-600 hover:bg-cream-100"}`}
          >
            {t.year} · {t.venue}
          </button>
        ))}
      </div>
      <div className="mt-4"><YearArchive key={active.slug} tournament={active} courses={courses} /></div>
    </section>
  );
}
