import { tournamentPreview, teeTimeLabel, type CodeTournament } from "./codeTournaments.ts";
import { matchScoring, matchStatus, normalizeCompetitor, type GolfMatchPairing, type GolfMatchPreview } from "./golfTripPreviewFixture.ts";
import { leaderboard, type League } from "./leagues.ts";
import { savedTripPresentation } from "./savedTripPresentation.ts";
import { roundScoringFrom, teamPoints } from "./teamPoints.ts";
import type { RoundCompSettings } from "./roundCompetition.ts";
import type { TvBoardData, TvMatchRow, TvPhase, TvPlayerRow, TvTeam } from "./liveTv.ts";
import type { SpectatorTrip, WatchView } from "./watchView.ts";

/**
 * The Maroon Live TV mode (project_specs.md, Step 4) on real events: what a watcher already gets (/api/watch/<code>,
 * private data removed on the server) turned into the TV board. Pure, no React; `today` is "YYYY-MM-DD".
 * Stage (owner 2026-11-22): before it starts / a round being played / between rounds / completed.
 */
export function tvFromWatch(view: WatchView, today: string): TvBoardData {
  if (view.kind === "league") return tvFromLeague(view.league, today);
  if (view.kind === "tournament") return tvFromTournament(view.tournament, today);
  return tvFromTrip(view.trip, today);
}

const DEFAULT_COLORS: [string, string] = ["#8a1c24", "#1f3a5f"];

/** "-3" / "E" / "+2" → a number; anything else ("—", "") → no score. */
export function parseToPar(text: string | undefined): number | null {
  if (!text) return null;
  if (text === "E") return 0;
  return /^[+-]?\d+$/.test(text) ? Number(text) : null;
}

/** "Today", "Tomorrow" or "Oct 9" for a round's date (nothing when it has none). */
export function dayLabel(date: string | null | undefined, today: string): string {
  if (!date) return "";
  if (date === today) return "Today";
  const next = new Date(`${today}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  if (date === next.toISOString().slice(0, 10)) return "Tomorrow";
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "8:40 AM" → "8:40" (the board's columns are narrow); "HH:MM" 24-hour → "8:40". */
const shortTime = (time: string | undefined) => {
  if (!time) return "";
  const label = /^\d{1,2}:\d{2}$/.test(time) ? teeTimeLabel(time) : time;
  return label.replace(/\s?(AM|PM)$/i, "");
};

/** Best total first; players with no score go last (by name). Shared places get a "T". */
function ranked(rows: TvPlayerRow[], before: boolean): TvPlayerRow[] {
  const sorted = [...rows].sort((a, b) => a.total == null ? (b.total == null ? a.name.localeCompare(b.name) : 1) : b.total == null ? -1 : a.total - b.total || a.name.localeCompare(b.name));
  return sorted.map((row) => {
    if (before || row.total == null) return { ...row, position: before ? "" : "–" };
    const first = sorted.findIndex((r) => r.total === row.total);
    const shared = sorted.filter((r) => r.total === row.total).length > 1;
    return { ...row, position: `${shared ? "T" : ""}${first + 1}` };
  });
}

/** Points needed to win: more than half of what's available (24 → 12½, 11 → 6). */
export function toWinFrom(available: number): number | null {
  if (!(available > 0)) return null;
  return available % 2 === 0 ? available / 2 + 0.5 : Math.ceil(available / 2);
}

function matchRow(pairing: GolfMatchPairing, index: number, net: boolean): TvMatchRow {
  const left = normalizeCompetitor(pairing.left);
  const right = pairing.right ? normalizeCompetitor(pairing.right) : null;
  const label = (side: typeof left | null) => side ? side.name ?? side.golfers.map((g) => g.name).join(" / ") : "—";
  const standing = net ? pairing.net : pairing.gross;
  const status = matchStatus({ thru: left.thru ?? left.golfers[0]?.thru, teeTime: left.teeTime ?? left.golfers[0]?.teeTime, standing, result: pairing.result });
  const middle = status.kind === "final" ? "F" : status.kind === "thru" ? `Thru ${status.holes}` : shortTime(status.time);
  const score = status.kind === "final" ? status.text : status.kind === "thru" && standing ? (standing.leader ? `${standing.up} UP` : "AS") : "";
  const leader = status.kind === "tee" || !standing || (status.kind === "final" && status.text === "AS") ? null : standing.leader;
  return { number: index + 1, left: label(left), right: label(right), middle, score, leader };
}

type Round = { number: number; date: string | null };

/** A trip's or tournament's board, from the leaderboard / matches the app already draws (GolfMatchPreview). */
export function tvFromPreview(p: GolfMatchPreview, event: { name: string; place: string | null; rounds: Round[]; ended: boolean; colors?: (string | null)[] }, today: string): TvBoardData {
  const net = matchScoring(p) === "Net";
  const played = (holes: (number | null)[], thru: string) => thru === "F" ? 18 : holes.filter((h) => h != null).length;
  const entries = p.leaderboard.map((e) => ({ e, played: played(e.holes ?? [], e.golfer.thru) }));
  const anyStarted = entries.some((x) => x.played > 0);
  const allDone = entries.length > 0 && entries.every((x) => x.played >= Math.max(18, (p.par ?? []).length || 18) || x.e.golfer.thru === "F");
  const anyTotals = p.leaderboard.some((e) => parseToPar(net ? e.netTotal : e.total) != null);
  const phase: TvPhase = event.ended ? "final" : anyStarted && !allDone ? "live"
    : allDone ? (p.round < p.roundCount ? "between" : "final") : anyTotals ? "between" : "before";
  // Between: the next round to play (after this one once it's done, else this one).
  const nextNumber = phase === "between" && allDone ? p.round + 1 : p.round;
  const dateOf = (n: number) => event.rounds.find((r) => r.number === n)?.date ?? null;
  const withDate = (n: number) => [`Round ${n}`, dayLabel(dateOf(n), today)].filter(Boolean).join(" · ");
  const roundLabel = phase === "before" ? withDate(p.round) : phase === "live" ? `Round ${p.round}`
    : phase === "between" ? withDate(nextNumber) : `After ${p.roundCount} ${p.roundCount === 1 ? "round" : "rounds"}`;

  const individual = ranked(p.leaderboard.map((e) => {
    const thru = e.golfer.thru === "F" ? "F" : /^Thru (\d+)$/.exec(e.golfer.thru)?.[1] ?? (/^\d+$/.test(e.thru) ? e.thru : "");
    return { position: "", name: e.golfer.name, total: parseToPar(net ? e.netTotal : e.total), today: parseToPar(net ? e.netToday : e.today),
      thru: thru || (phase === "between" || phase === "final" ? "F" : shortTime(e.golfer.teeTime) || "–") };
  }), phase === "before");

  const pairings = p.matches.filter((m) => (m.round ?? p.round) === p.round);
  const points = teamPoints(p);
  const colors = event.colors ?? [];
  const match = pairings.length ? {
    teams: [0, 1].map((i) => ({ name: p.sides[i].name, color: colors[i] || DEFAULT_COLORS[i], points: points?.points[i] ?? 0 })) as [TvTeam, TvTeam],
    toWin: points ? toWinFrom(points.available) : null,
    matches: pairings.map((m, i) => matchRow(m, i, net)),
  } : null;
  return { eventName: event.name, place: event.place, roundLabel, phase, individual: individual.length ? individual : null, match };
}

/** A tournament: today's round, else the latest round with scores, else round 1. */
export function tvFromTournament(t: CodeTournament, today: string): TvBoardData {
  const withScores = t.rounds.filter((r) => t.holes.some((h) => h.round === r.number));
  const shown = t.rounds.find((r) => r.date === today)?.number ?? withScores.at(-1)?.number ?? t.rounds[0]?.number ?? 1;
  const preview = tournamentPreview(t, shown);
  return tvFromPreview(preview, { name: t.name, place: preview.course || null, rounds: t.rounds.map((r) => ({ number: r.number, date: r.date })), ended: t.status === "ended" }, today);
}

/** A trip: the same leaderboard and matches the live page shows (WatchPage's SpectatorTrip). */
export function tvFromTrip(trip: SpectatorTrip, today: string): TvBoardData {
  const { savedTrip, scoring, setup } = trip;
  const values = setup.values;
  const preview: GolfMatchPreview = { ...savedTripPresentation(savedTrip, scoring, today),
    roundScoring: roundScoringFrom(savedTrip.rounds.map((r) => ({ number: r.roundNumber, dayNumber: r.dayNumber })), values.compFormats as Record<string, RoundCompSettings> | undefined,
      values.compRounds as Record<string, boolean> | undefined, Number(values.playerTotal) || savedTrip.members.length) };
  return tvFromPreview(preview, {
    name: savedTrip.trip.name, place: trip.place || preview.course || null,
    rounds: savedTrip.rounds.map((r) => ({ number: r.roundNumber, date: r.playDate })), ended: savedTrip.trip.status === "completed",
    colors: values.teamColors as (string | null)[] | undefined,
  }, today);
}

/** A league: one round, one day, one course; no "between rounds". Its group tee times show before it starts. */
export function tvFromLeague(league: League, today: string): TvBoardData {
  const rows = leaderboard(league, league.scoring);
  const anyStarted = rows.some((r) => r.thru > 0);
  const allDone = rows.length > 0 && rows.every((r) => r.thru >= league.course.par.length);
  const phase: TvPhase = league.status === "ended" || allDone ? "final" : anyStarted ? "live" : "before";
  const teeOf = (id: string) => shortTime(league.groups.find((g) => g.players.includes(id))?.time);
  const individual = ranked(rows.map((r) => ({ position: "", name: r.name, total: r.toPar, today: r.toPar,
    thru: r.thru >= league.course.par.length ? "F" : r.thru > 0 ? String(r.thru) : teeOf(r.profileId) || "–" })), phase === "before");
  const day = dayLabel(league.date, today);
  return { eventName: league.name, place: league.course.name || null, phase, individual: individual.length ? individual : null, match: null,
    roundLabel: phase === "live" ? "Today" : day };
}
