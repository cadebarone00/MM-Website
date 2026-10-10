import { pinehurst2024 } from "../data/2024-pinehurst";
import { danzante2025 } from "../data/2025-danzante";
import { palmSprings2026 } from "../data/2026-palm-springs";
import { scorecards2024 } from "../data/scorecards-2024";
import { scorecards2025 } from "../data/scorecards-2025";
import { scorecards2026 } from "../data/scorecards-2026";
import { getPlayerProfileBySlug } from "../data/players";
import { legacyScorecardRound, matchRound } from "../data/roundIdentity";
import { tournamentRoundSequence } from "../data/tournamentRoundSequence";
import type { PlayerScorecard, RealMatch, Team, Tournament } from "../data/types";
import {
  PACKAGE_FORMAT, PACKAGE_VERSION, type HistoricalCourse, type HistoricalEdition, type HistoricalFlag, type HistoricalHole, type HistoricalMatch,
  type HistoricalPackage, type HistoricalRound, type HistoricalScore,
} from "./historicalPackage";

/**
 * The Maroon 2024–2026 → a version 1 Historical Trip Package (lib/history/historicalPackage.ts). The first real
 * dataset of the generic feature; nothing Maroon-specific goes into the app because of it.
 *
 * Source = the repository's checked historical archive, the same data the old site shows: the edition files
 * (lib/data/2024-pinehurst.ts, 2025-danzante.ts, 2026-palm-springs.ts: dates, rosters by team, every match with its
 * points, team totals, individual champion) and the hole-by-hole scorecards (lib/data/scorecards-2024/25/26.ts). Round
 * numbers follow the archive's own rules (tournamentRoundSequence, legacyScorecardRound). Anything missing or
 * uncertain is null and listed in `flags` — never guessed. Old accounts, usernames, bios and photos are not part of it.
 *
 * Deterministic: the same archive always gives the same package (and checksum), so re-importing it is a no-op.
 */

/** Bump when the archive data itself is corrected; it's part of the dataset, so a changed export is a new import. */
export const MAROON_EXPORT_REVISION = "2026-10-10";

const EDITIONS: { tournament: Tournament; cards: PlayerScorecard[] }[] = [
  { tournament: pinehurst2024, cards: scorecards2024 },
  { tournament: danzante2025, cards: scorecards2025 },
  { tournament: palmSprings2026, cards: scorecards2026 },
];
const TEAMS: { key: Team; name: string; color: string }[] = [{ key: "maroon", name: "Maroon", color: "#500001" }, { key: "white", name: "White", color: "#ffffff" }];
const TEAM_FORMAT = /alt(ernate)?[- ]?shot|foursome|scramble/i;

const person = (slug: string) => `p:${slug}`;
const slugKey = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);

function result(match: RealMatch): string | null {
  if (match.maroonPts === match.whitePts) return "Halved";
  if (!match.margin) return null;
  return match.holesRemaining ? `${match.margin}&${match.holesRemaining}` : `${match.margin} up`;
}

export function exportMaroonHistory(): HistoricalPackage {
  const flags: HistoricalFlag[] = [];
  const flag = (level: HistoricalFlag["level"], path: string, message: string) => flags.push({ level, path, message });
  const participants = new Map<string, string>();
  const courses = new Map<string, HistoricalCourse>();

  const editions = EDITIONS.map(({ tournament: t, cards }): HistoricalEdition => {
    const year = t.year;
    const at = `editions[${year}]`;
    const roster = new Map<string, Team>();
    for (const team of ["maroon", "white"] as const) for (const slug of t.roster[team]) roster.set(slug, team);
    for (const slug of roster.keys()) {
      const name = getPlayerProfileBySlug(slug)?.fullName?.trim();
      if (!name) flag("uncertain", `participants[${slug}]`, `No full name on record for "${slug}"; the slug is used as the name.`);
      participants.set(slug, name || slug);
    }
    flag("uncertain", `${at}.roster`, "Team captains weren't recorded; captain is null for everyone.");

    // The schedule: every day + session in order is a round (Alternate Shot included — a shared card, no personal score).
    const rounds = new Map<number, HistoricalRound>();
    tournamentRoundSequence(t).forEach((first, index) => {
      const number = index + 1;
      const date = t.dayDates?.[first.day] ?? null;
      if (!date) flag("uncertain", `${at}.rounds[${number}].date`, `No date recorded for day ${first.day}.`);
      rounds.set(number, {
        key: `${year}:r${number}`, number, day: first.day, session: first.session, date, course: null,
        format: first.format, scoring: TEAM_FORMAT.test(first.format) ? "team" : "individual", scores: [],
      });
    });

    // Cards: hole-by-hole, mapped to the real round number. A card for a round the schedule doesn't have (e.g. an
    // individual side event) becomes its own round, flagged.
    for (const card of cards) {
      if (!roster.has(card.player)) { flag("excluded", `${at}.scores[${card.player}]`, `Card for "${card.player}", who isn't on the ${year} roster — left out.`); continue; }
      if (roster.get(card.player) !== card.team) flag("uncertain", `${at}.scores[${card.player}]`, `Card says team ${card.team}, roster says ${roster.get(card.player)}; the roster is used.`);
      for (const played of card.rounds) {
        let number: number;
        try { number = legacyScorecardRound(year, played.round); } catch {
          flag("excluded", `${at}.scores[${card.player}][${played.round}]`, `Card round ${played.round} doesn't map to a ${year} round — left out.`); continue;
        }
        let round = rounds.get(number);
        if (!round) {
          round = { key: `${year}:r${number}`, number, day: null, session: null, date: null, course: null, format: played.format ?? "Individual", scoring: "individual", scores: [] };
          rounds.set(number, round);
          flag("uncertain", `${at}.rounds[${number}]`, `Round ${number} (${played.course}) has cards but no matches; day, session and date aren't recorded.`);
        }
        if (round.scoring === "team") { flag("excluded", `${at}.rounds[${number}]`, `A personal card in a shared-card round (${round.format}) — left out.`); continue; }
        if (played.format && played.format !== round.format) flag("uncertain", `${at}.rounds[${number}].format`, `Card format "${played.format}" differs from the schedule's "${round.format}"; the schedule is used.`);
        // Course: one per round, from the cards (par only when the card has all 18 holes).
        const courseKey = `c:${slugKey(played.course)}`;
        if (!courses.has(courseKey)) {
          const par = played.holes.length === 18 ? played.holes.reduce((sum, h) => sum + h.par, 0) : null;
          courses.set(courseKey, { key: courseKey, name: played.course, place: t.location || null, ref: null, par });
        }
        if (round.course && round.course !== courseKey) flag("uncertain", `${at}.rounds[${number}].course`, `Cards disagree on the course (${round.course} vs ${courseKey}); the first is kept.`);
        round.course ??= courseKey;

        const holes: HistoricalHole[] = played.holes.filter((h) => h.score > 0).map((h) => ({
          number: h.hole, par: h.par || null, strokes: h.score, putts: Number.isInteger(h.putts) && h.putts >= 0 ? h.putts : null,
          fairway: h.fir === "X" ? null : h.fir === 1 ? "hit" : "missed", green: h.gir === 1,
        }));
        const holesPlayed: 9 | 18 = holes.length === 9 ? 9 : 18;
        const sum = holes.reduce((s, h) => s + h.strokes, 0);
        const complete = holes.length === holesPlayed;
        if (!complete) flag("uncertain", `${at}.rounds[${number}].scores[${card.player}]`, `${holes.length} holes scored; the total is left empty.`);
        else if (sum !== played.total) flag("uncertain", `${at}.rounds[${number}].scores[${card.player}]`, `Recorded total ${played.total} ≠ hole scores ${sum}; the hole scores are used.`);
        const score: HistoricalScore = { participant: person(card.player), holesPlayed, total: complete ? sum : null, holes };
        if (round.scores.some((s) => s.participant === score.participant)) { flag("excluded", `${at}.rounds[${number}].scores[${card.player}]`, "A second card for the same round — left out."); continue; }
        round.scores.push(score);
      }
    }
    for (const round of rounds.values()) if (!round.course) flag("uncertain", `${at}.rounds[${round.number}].course`, `No course recorded for round ${round.number} (${round.format}).`);

    const matches: HistoricalMatch[] = t.matches.flatMap((m) => {
      const number = matchRound(t, m);
      if (number === null) { flag("excluded", `${at}.matches[${m.id}]`, "Match isn't in the schedule — left out."); return []; }
      return [{
        key: `${year}:${slugKey(m.id)}`, round: `${year}:r${number}`, format: m.format,
        sides: [{ team: "maroon", participants: m.maroonPlayers.map(person) }, { team: "white", participants: m.whitePlayers.map(person) }],
        points: [m.maroonPts, m.whitePts], result: result(m),
        winner: m.maroonPts > m.whitePts ? "0" : m.maroonPts < m.whitePts ? "1" : "halved",
      }];
    });
    for (const m of t.archiveOnlyMatches ?? []) flag("excluded", `${at}.matches[${m.id}]`, "Listed in the archive but never played (no points) — left out.");
    if (t.matches.some((m) => m.maroonPts + m.whitePts > 1)) flag("uncertain", `${at}.matches`, "Matches were worth more than one point (multi-point scoring); each match's result text is its recorded margin.");
    if (t.notes) flag("uncertain", at, `Note on record: ${t.notes}`);

    return {
      key: String(year), year, label: t.editionLabel, startDate: t.startDate || null, endDate: t.endDate || null,
      place: [t.venue, t.location].filter(Boolean).join(", ") || null,
      teams: TEAMS,
      roster: [...roster.entries()].map(([slug, team]) => ({ participant: person(slug), team, captain: null })),
      rounds: [...rounds.values()].sort((a, b) => a.number - b.number),
      matches,
      results: {
        teams: [{ team: "maroon", points: t.maroonPts }, { team: "white", points: t.whitePts }],
        pointsAvailable: t.pointsAvailable ?? null,
        winnerTeam: t.maroonPts > t.whitePts ? "maroon" : t.maroonPts < t.whitePts ? "white" : null,
        individualChampion: t.individualChampion && roster.has(t.individualChampion) ? person(t.individualChampion) : null,
      },
    };
  });

  return {
    format: PACKAGE_FORMAT, version: PACKAGE_VERSION,
    dataset: {
      key: "the-maroon-2024-2026", name: "The Maroon 2024–2026",
      source: "Repository historical archive: lib/data/2024-pinehurst.ts, 2025-danzante.ts, 2026-palm-springs.ts, scorecards-2024/2025/2026.ts (cell maps in docs/source-data).",
      exportedAt: MAROON_EXPORT_REVISION,
    },
    event: { key: "the-maroon", name: "The Maroon" },
    participants: [...participants.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([slug, name]) => ({ key: person(slug), name })),
    courses: [...courses.values()].sort((a, b) => a.key.localeCompare(b.key)),
    editions,
    flags,
  };
}
