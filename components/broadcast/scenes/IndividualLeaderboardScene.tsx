import Image from "next/image";
import { getPlayerDisplayName } from "@/lib/data/players";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import type { BroadcastStanding } from "@/lib/broadcast/types";
import { getMockRunCycleMs, getMockStandings } from "@/lib/broadcast/mockRun";
import { placementLabel } from "@/lib/leaderboard/placement";

interface Row extends BroadcastStanding {
  pos: string;
}

function rankRows(standings: BroadcastStanding[]): Row[] {
  return standings.map((standing, index) => ({ ...standing, pos: placementLabel(standings, index) }));
}

function todayLabel(value: number | null | undefined) {
  return value == null
    ? <span className="text-[color:var(--color-ink-400)]">-</span>
    : <ScoreBadge value={value} size="lg" className={value < 0 ? "text-score-under" : "text-white"} />;
}

function thruLabel(value: number | null | undefined) {
  return value == null ? "-" : value >= 18 ? "F" : String(value);
}

function MockLeaderboardScene({ elapsedMs, videoDurationMs, seed, animation, forcedEventKind }: { elapsedMs: number; videoDurationMs: number | null; seed: number; animation: { birdieEnabled: boolean; birdieDelayMs: number; rowMoveMs: number } | null; forcedEventKind?: "birdie" | "eagle" | "bogey" }) {
  const cycleMs = getMockRunCycleMs(videoDurationMs ?? undefined);
  const cycle = Math.floor(Math.max(0, elapsedMs) / cycleMs) % 2;
  const timeInCycle = Math.max(0, elapsedMs) % cycleMs;
  const eventDelayMs = animation?.birdieDelayMs ?? 7000;
  const initialEvent = getMockStandings(seed, false, cycle, forcedEventKind);
  const eventKind = initialEvent.eventKind;
  const eventElapsedMs = timeInCycle - eventDelayMs;
  const celebrationShowing = Boolean(animation?.birdieEnabled ?? true) && eventKind !== "bogey" && eventElapsedMs >= 0 && eventElapsedMs < 1_900;
  const bogeyBlinking = eventKind === "bogey" && eventElapsedMs >= 0 && eventElapsedMs < 1_400;
  const bogeyBlinkVisible = bogeyBlinking && Math.floor(eventElapsedMs / 350) % 2 === 0;
  const scoreChangeAtMs = eventDelayMs + (eventKind === "bogey" ? 1_400 : 1_500);
  const scoreChangeApplied = timeInCycle >= scoreChangeAtMs;
  const rowMoveApplied = timeInCycle >= scoreChangeAtMs + 1_900;
  const totalChanging = scoreChangeApplied && !rowMoveApplied;
  const { standings, eventPlayer } = getMockStandings(seed, scoreChangeApplied, cycle, forcedEventKind, rowMoveApplied);
  const rows = rankRows(standings);

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-10 py-10">
      <Image src="/loading/desktop.png" alt="" fill priority sizes="100vw" className="object-cover" />
      <div className="absolute inset-0 bg-maroon-900/80" />
      <Image src="/broadcast/oak-motif.png" alt="" width={980} height={980} aria-hidden className="pointer-events-none absolute -bottom-60 -right-44 opacity-[0.27]" />
      <div className="relative z-[1] w-full max-w-[900px]">
        <div className="mb-2 flex items-baseline justify-between border-b border-[color:var(--color-gold-400)]/35 pb-3">
          <span className="font-serif text-lg italic text-[color:var(--color-cream-100)]">The Maroon Masters</span>
          <span className="font-condensed text-sm font-bold uppercase tracking-[0.2em] text-[color:var(--color-cream-50)]">Individual Leaderboard</span>
          <span className="font-condensed text-sm font-bold uppercase tracking-[0.2em] text-[color:var(--color-gold-300)]">Mock Live</span>
        </div>
        <div className="flex h-7 items-center gap-4 px-2 font-condensed text-xs font-bold uppercase tracking-[0.16em] text-[color:var(--color-ink-400)]">
          <span className="w-[52px] shrink-0 text-right">Pos</span>
          <span className="w-2.5 shrink-0" />
          <span className="flex-1">Player</span>
          <span className="w-[64px] text-center">Tot</span>
          <span className="w-[64px] text-center">Tdy</span>
          <span className="w-[56px] text-center">Thru</span>
        </div>
        <div className="relative" style={{ height: rows.length * 66 }}>
          {rows.map((row, index) => {
            const eventRow = row.player === eventPlayer;
            return (
              <div
                key={row.player}
                style={{
                  transform: `translateY(${index * 66}px) scale(${eventRow && celebrationShowing ? 1.1 : 1})`,
                  // Only the player whose score changed gets a moving-row
                  // animation. Everyone else snaps to the refreshed board
                  // so one Birdie/Bogey never makes the whole table slide.
                  transitionDuration: eventRow ? `${animation?.rowMoveMs ?? 1000}ms` : "0ms",
                }}
                className={[
                  "absolute inset-x-0 flex h-[62px] items-center gap-4 overflow-hidden border-b border-white/[0.06] px-2 transition-transform duration-1000 ease-out",
                  index === 0 ? "bg-gradient-to-r from-[color:var(--color-gold-400)]/[0.08] to-transparent" : "",
                ].join(" ")}
              >
                {eventRow && eventKind !== "bogey" && <span aria-hidden className="absolute inset-0 bg-maroon-700 transition-[clip-path] duration-700 ease-out" style={{ clipPath: celebrationShowing ? "circle(150% at 50% 50%)" : "circle(0% at 50% 50%)" }} />}
                {eventRow && bogeyBlinkVisible && <span aria-hidden className="absolute inset-0 z-20 bg-white/90" />}
                {eventRow && celebrationShowing && (
                  <span className="absolute inset-0 z-20 grid place-items-center font-condensed text-5xl font-black uppercase tracking-[0.22em] text-white [text-shadow:0_3px_0_rgba(73,20,30,0.7),0_0_24px_rgba(255,255,255,0.42)]">
                    {eventKind.toUpperCase()}
                  </span>
                )}
                <span className="relative z-10 w-[52px] shrink-0 text-right font-score text-2xl font-bold leading-none tabular-nums text-[color:var(--color-cream-50)]">{row.pos}</span>
                <span aria-hidden className={["relative z-10 h-2.5 w-2.5 shrink-0 rounded-full", row.team === "maroon" ? "bg-[color:var(--color-maroon-500)]" : "bg-[color:var(--color-cream-100)]"].join(" ")} />
                <span className="relative z-10 flex-1 truncate font-sans text-xl font-bold uppercase tracking-wide text-[color:var(--color-cream-50)]">{getPlayerDisplayName(row.player)}</span>
                <span className={[
                  "relative z-10 inline-flex min-w-[64px] justify-center rounded-md bg-[color:var(--color-cream-50)] px-3 py-1",
                  eventRow && totalChanging ? "mm-broadcast-total-change" : "",
                ].join(" ")}><ScoreBadge value={row.toPar} size="lg" /></span>
                <span className="relative z-10 inline-flex w-[64px] justify-center">{todayLabel(row.todayToPar)}</span>
                <span className="relative z-10 inline-flex w-[56px] justify-center font-score text-2xl font-bold leading-none tabular-nums text-[color:var(--color-cream-50)]">{thruLabel(row.thru)}</span>
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
export function IndividualLeaderboardScene({ standings, final = false, mockElapsedMs = null, mockVideoDurationMs = null, mockSeed = 1, mockAnimation = null, mockForcedEventKind }: { standings: BroadcastStanding[]; final?: boolean; mockElapsedMs?: number | null; mockVideoDurationMs?: number | null; mockSeed?: number; mockAnimation?: { birdieEnabled: boolean; birdieDelayMs: number; rowMoveMs: number } | null; mockForcedEventKind?: "birdie" | "eagle" | "bogey" }) {
  if (mockElapsedMs != null) return <MockLeaderboardScene elapsedMs={mockElapsedMs} videoDurationMs={mockVideoDurationMs} seed={mockSeed} animation={mockAnimation} forcedEventKind={mockForcedEventKind} />;
  const rows = rankRows(standings);

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-10 py-10">
      <Image src="/loading/desktop.png" alt="" fill priority sizes="100vw" className="object-cover" />
      <div className="absolute inset-0 bg-maroon-900/80" />
      <Image src="/broadcast/oak-motif.png" alt="" width={980} height={980} aria-hidden className="pointer-events-none absolute -bottom-60 -right-44 opacity-[0.27]" />
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

        <div className="flex h-7 items-center gap-4 px-2 font-condensed text-xs font-bold uppercase tracking-[0.16em] text-[color:var(--color-ink-400)]">
          <span className="w-[52px] shrink-0 text-right">Pos</span>
          <span className="w-2.5 shrink-0" />
          <span className="flex-1">Player</span>
          <span className="w-[64px] text-center">Tot</span>
          <span className="w-[64px] text-center">Tdy</span>
          <span className="w-[56px] text-center">Thru</span>
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
                <span className="w-[52px] shrink-0 text-right font-score text-2xl font-bold leading-none tabular-nums text-[color:var(--color-cream-50)]">
                  {r.pos}
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
                <span className="inline-flex w-[64px] justify-center">{todayLabel(r.todayToPar)}</span>
                <span className="inline-flex w-[56px] justify-center font-score text-2xl font-bold leading-none tabular-nums text-[color:var(--color-cream-50)]">{thruLabel(r.thru)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
