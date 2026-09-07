import Image from "next/image";
import { getPlayerDisplayName } from "@/lib/data/players";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import type { BroadcastStanding } from "@/lib/broadcast/types";
import { getMockRunCycleMs } from "@/lib/broadcast/mockRun";

interface Row extends BroadcastStanding {
  pos: number;
  showPos: boolean;
}

/** Groups ties (equal toPar) under one shared position number, blank on the rows underneath — same convention the reference broadcast leaderboard uses. */
function rankRows(standings: BroadcastStanding[]): Row[] {
  let pos = 0;
  let lastToPar: number | null = null;
  return standings.map((s, i) => {
    if (lastToPar === null || s.toPar !== lastToPar) {
      pos = i + 1;
      lastToPar = s.toPar;
      return { ...s, pos, showPos: true };
    }
    return { ...s, pos, showPos: false };
  });
}

const MOCK_STARTING_STANDINGS: BroadcastStanding[] = [
  { player: "Cade", team: "white", toPar: -5 },
  { player: "Luke", team: "maroon", toPar: -4 },
  { player: "Cam", team: "maroon", toPar: -3 },
  { player: "Collin", team: "white", toPar: -2 },
  { player: "Jackson", team: "white", toPar: -1 },
  { player: "Drew", team: "maroon", toPar: 0 },
];

function MockLeaderboardScene({ elapsedMs, videoDurationMs }: { elapsedMs: number; videoDurationMs: number | null }) {
  const cycleMs = getMockRunCycleMs(videoDurationMs ?? undefined);
  const cycle = Math.floor(Math.max(0, elapsedMs) / cycleMs) % 2;
  const timeInCycle = Math.max(0, elapsedMs) % cycleMs;
  const birdiePlayer = cycle === 0 ? "Cam" : "Jackson";
  const birdieShowing = timeInCycle >= 7_000 && timeInCycle < 8_900;
  const birdieApplied = timeInCycle >= 8_500;
  const standings = MOCK_STARTING_STANDINGS
    .map((standing) => standing.player === birdiePlayer && birdieApplied ? { ...standing, toPar: cycle === 0 ? -6 : -5 } : standing)
    .sort((a, b) => a.toPar - b.toPar);
  const rows = rankRows(standings);

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-10 py-10">
      <Image src="/loading/desktop.png" alt="" fill priority sizes="100vw" className="object-cover" />
      <div className="absolute inset-0 bg-maroon-900/80" />
      <div className="relative z-[1] w-full max-w-[900px]">
        <div className="mb-2 flex items-baseline justify-between border-b border-[color:var(--color-gold-400)]/35 pb-3">
          <span className="font-serif text-lg italic text-[color:var(--color-cream-100)]">The Maroon Masters</span>
          <span className="font-condensed text-sm font-bold uppercase tracking-[0.2em] text-[color:var(--color-cream-50)]">Individual Leaderboard</span>
          <span className="font-condensed text-sm font-bold uppercase tracking-[0.2em] text-[color:var(--color-gold-300)]">Mock Live</span>
        </div>
        <div className="relative" style={{ height: rows.length * 66 }}>
          {rows.map((row, index) => {
            const birdieRow = row.player === birdiePlayer;
            return (
              <div
                key={row.player}
                style={{ transform: `translateY(${index * 66}px)` }}
                className={[
                  "absolute inset-x-0 flex h-[62px] items-center gap-4 border-b border-white/[0.06] px-2 transition-transform duration-1000 ease-out",
                  index === 0 ? "bg-gradient-to-r from-[color:var(--color-gold-400)]/[0.08] to-transparent" : "",
                  birdieRow && birdieShowing ? "bg-emerald-400/20" : "",
                ].join(" ")}
              >
                <span className="w-8 shrink-0 text-right font-condensed text-lg font-bold tabular-nums text-[color:var(--color-ink-400)]">{row.showPos ? row.pos : ""}</span>
                <span aria-hidden className={["h-2.5 w-2.5 shrink-0 rounded-full", row.team === "maroon" ? "bg-[color:var(--color-maroon-500)]" : "bg-[color:var(--color-cream-100)]"].join(" ")} />
                <span className="flex-1 truncate font-sans text-xl font-bold uppercase tracking-wide text-[color:var(--color-cream-50)]">{getPlayerDisplayName(row.player)}</span>
                {birdieRow && birdieShowing && <span className="animate-pulse rounded bg-emerald-400 px-2 py-1 font-condensed text-xs font-black tracking-[0.16em] text-emerald-950">BIRDIE</span>}
                <span className="inline-flex min-w-[64px] justify-center rounded-md bg-[color:var(--color-cream-50)] px-3 py-1"><ScoreBadge value={row.toPar} size="lg" /></span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * A TV leaderboard graphic in The Maroon Masters' own colors — a full-bleed
 * dark stage-lit canvas (not a card), modeled on modern golf broadcast
 * packages (Golf Channel / PGA Tour Live) rather than a plain website
 * table. Score colors are the site's real red/green/near-black convention
 * (ScoreBadge, shared with every scorecard on the site) — gold here is a
 * pure accent, never a score meaning. See the Round 1 redesign spec.
 */
export function IndividualLeaderboardScene({ standings, final = false, mockElapsedMs = null, mockVideoDurationMs = null }: { standings: BroadcastStanding[]; final?: boolean; mockElapsedMs?: number | null; mockVideoDurationMs?: number | null }) {
  if (mockElapsedMs != null) return <MockLeaderboardScene elapsedMs={mockElapsedMs} videoDurationMs={mockVideoDurationMs} />;
  const rows = rankRows(standings);

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-10 py-10">
      <Image src="/loading/desktop.png" alt="" fill priority sizes="100vw" className="object-cover" />
      <div className="absolute inset-0 bg-maroon-900/80" />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-[10%] -right-[6%] z-[1] font-serif text-[22vw] font-semibold italic leading-none text-transparent [-webkit-text-stroke:1px_rgba(201,168,110,0.14)]"
      >
        MM
      </span>

      <div className="relative z-[1] w-full max-w-[900px]">
        <div className="mb-2 flex items-baseline justify-between border-b border-[color:var(--color-gold-400)]/35 pb-3">
          <span className="font-serif text-lg italic text-[color:var(--color-cream-100)]">The Maroon Masters</span>
          <span className="font-condensed text-sm font-bold uppercase tracking-[0.2em] text-[color:var(--color-cream-50)]">Individual Leaderboard</span>
          <span className="font-condensed text-sm font-bold uppercase tracking-[0.2em] text-[color:var(--color-gold-300)]">{final ? "Final" : "Live"}</span>
        </div>

        {rows.length === 0 ? (
          <p className="px-2 py-16 text-center font-sans text-lg text-[color:var(--color-ink-400)]">
            No scores posted yet. Check back once play begins.
          </p>
        ) : (
          <div>
            {rows.map((r, i) => (
              <div
                key={r.player}
                className={[
                  "flex items-center gap-4 border-b border-white/[0.06] px-2 py-3",
                  i === 0 ? "bg-gradient-to-r from-[color:var(--color-gold-400)]/[0.08] to-transparent" : "",
                ].join(" ")}
              >
                <span className="w-8 shrink-0 text-right font-condensed text-lg font-bold tabular-nums text-[color:var(--color-ink-400)]">
                  {r.showPos ? r.pos : ""}
                </span>
                <span
                  aria-hidden
                  className={[
                    "h-2.5 w-2.5 shrink-0 rounded-full",
                    r.team === "maroon" ? "bg-[color:var(--color-maroon-500)] shadow-[0_0_6px_rgba(168,82,88,0.9)]" : "bg-[color:var(--color-cream-100)]",
                  ].join(" ")}
                />
                <span className="flex-1 truncate font-sans text-xl font-bold uppercase tracking-wide text-[color:var(--color-cream-50)]">
                  {getPlayerDisplayName(r.player)}
                </span>
                <span className="inline-flex min-w-[64px] justify-center rounded-md bg-[color:var(--color-cream-50)] px-3 py-1">
                  <ScoreBadge value={r.toPar} size="lg" />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
