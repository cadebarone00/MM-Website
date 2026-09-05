import { matchResultLabel, teamLabel, type ActiveBroadcastEvent } from "@/lib/broadcast/eventDisplay";
import type { BroadcastMatchPlay } from "@/lib/broadcast/matchPlayData";
import type { BroadcastTeam } from "@/lib/broadcast/types";

interface MatchWonPayload {
  matchBoxId: string;
  round: number;
  leader: BroadcastTeam | "tie";
  margin: number;
  maroonPts: number;
  whitePts: number;
}

interface RoundFinalPayload {
  round: number;
}

/**
 * Full-bleed graphic for MATCH_WON/ROUND_FINAL — SceneRenderer renders
 * this INSTEAD OF the rotating scene while it's active (rotation is
 * frozen for the duration, see SceneRenderer.tsx). For MATCH_WON, looks
 * up the box in the already-live matchPlay data for its number/names AND
 * its live margin/holesRemaining — matchResultLabel() reproduces exactly
 * what MatchPlayScene.tsx's private statusLabel() already shows for a
 * Final box ("3 & 2" for an early closeout, "1 UP" for one that went the
 * distance, "Match Halved" for a tie), sourced from matchPlay rather than
 * the event payload itself (Phase 2's MATCH_WON payload doesn't carry
 * holesRemaining — see the spec's correction note). If the box can't be
 * found (e.g. the round rolled over while this MATCH_WON event was still
 * queued), renders a simpler payload-only card instead of nothing —
 * SceneRenderer has already replaced the normal scene with this takeover,
 * so returning null here would blank the screen for the full takeover
 * duration rather than degrade gracefully the way EventOverlay's null-render
 * does (which renders alongside a scene that's still there).
 */
export function EventTakeover({ event, matchPlay }: { event: ActiveBroadcastEvent | null; matchPlay: BroadcastMatchPlay }) {
  if (!event || event.displayMode !== "takeover") return null;

  if (event.kind === "ROUND_FINAL") {
    const payload = event.payload as unknown as RoundFinalPayload;
    return (
      <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-10 py-10 [background:radial-gradient(120%_90%_at_50%_8%,var(--color-maroon-700)_0%,var(--color-maroon-900)_46%,#0d0000_100%)]">
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-[10%] -right-[6%] font-serif text-[22vw] font-semibold italic leading-none text-transparent [-webkit-text-stroke:1px_rgba(201,168,110,0.14)]"
        >
          MM
        </span>
        <div className="relative z-[1] text-center">
          <p className="font-serif text-2xl italic text-[color:var(--color-cream-100)]">The Maroon Masters</p>
          <p className="mt-6 font-condensed text-6xl font-bold uppercase tracking-wide text-[color:var(--color-cream-50)]">Round {payload.round} Complete</p>
        </div>
      </div>
    );
  }

  const payload = event.payload as unknown as MatchWonPayload;
  const box = matchPlay.matchBoxes.find((b) => b.id === payload.matchBoxId);
  if (!box) {
    return (
      <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-10 py-10 [background:radial-gradient(120%_90%_at_50%_8%,var(--color-maroon-700)_0%,var(--color-maroon-900)_46%,#0d0000_100%)]">
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-[10%] -right-[6%] font-serif text-[22vw] font-semibold italic leading-none text-transparent [-webkit-text-stroke:1px_rgba(201,168,110,0.14)]"
        >
          MM
        </span>
        <div className="relative z-[1] text-center">
          <p className="font-serif text-2xl italic text-[color:var(--color-cream-100)]">The Maroon Masters</p>
          <p className="mt-6 font-condensed text-6xl font-bold uppercase tracking-wide text-[color:var(--color-cream-50)]">
            {payload.leader === "tie" ? "Match Halved" : `${teamLabel(payload.leader)} Wins`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-10 py-10 [background:radial-gradient(120%_90%_at_50%_8%,var(--color-maroon-700)_0%,var(--color-maroon-900)_46%,#0d0000_100%)]">
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-[10%] -right-[6%] font-serif text-[22vw] font-semibold italic leading-none text-transparent [-webkit-text-stroke:1px_rgba(201,168,110,0.14)]"
      >
        MM
      </span>
      <div className="relative z-[1] text-center">
        <p className="font-condensed text-sm font-bold uppercase tracking-[0.2em] text-[color:var(--color-gold-300)]">Match {box.boxNumber}</p>
        <p className="mt-3 font-condensed text-6xl font-bold uppercase tracking-wide text-[color:var(--color-cream-50)] [text-shadow:0_0_16px_rgba(220,196,149,0.4)]">
          {matchResultLabel(box.leader, box.margin, box.holesRemaining)}
        </p>
        <p className="mt-4 font-sans text-lg text-[color:var(--color-cream-100)]/80">
          {box.maroonNames.join(" / ")} vs. {box.whiteNames.join(" / ")}
        </p>
      </div>
    </div>
  );
}
