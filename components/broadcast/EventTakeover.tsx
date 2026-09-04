import { closedMarginLabel, teamLabel, type ActiveBroadcastEvent } from "@/lib/broadcast/eventDisplay";
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
 * its live margin/holesRemaining — closedMarginLabel() reproduces exactly
 * what MatchPlayScene.tsx's private statusLabel() already shows for a
 * Final box ("3 & 2" for an early closeout, "1 UP" for one that went the
 * distance), sourced from matchPlay rather than the event payload itself
 * (Phase 2's MATCH_WON payload doesn't carry holesRemaining — see the
 * spec's correction note). Renders nothing if the box can't be found, same
 * as EventOverlay.
 */
export function EventTakeover({ event, matchPlay }: { event: ActiveBroadcastEvent | null; matchPlay: BroadcastMatchPlay }) {
  if (!event || event.displayMode !== "takeover") return null;

  if (event.kind === "ROUND_FINAL") {
    const payload = event.payload as unknown as RoundFinalPayload;
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-gradient-maroon px-10 py-10">
        <div className="w-full max-w-[900px] rounded-2xl bg-[color:var(--color-cream-50)] px-10 py-16 text-center shadow-2xl ring-1 ring-[color:var(--color-gold-400)]/40">
          <p className="font-serif text-2xl italic text-[color:var(--color-maroon-700)]">The Maroon Masters</p>
          <p className="mt-6 font-condensed text-5xl font-bold uppercase tracking-wide text-[color:var(--color-maroon-900)]">Round {payload.round} Complete</p>
        </div>
      </div>
    );
  }

  const payload = event.payload as unknown as MatchWonPayload;
  const box = matchPlay.matchBoxes.find((b) => b.id === payload.matchBoxId);
  if (!box) return null;

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-maroon px-10 py-10">
      <div className="w-full max-w-[900px] overflow-hidden rounded-2xl shadow-2xl ring-1 ring-[color:var(--color-gold-400)]/40">
        <div className="bg-[color:var(--color-cream-50)] px-8 pb-5 pt-7 text-center">
          <p className="font-serif text-2xl italic text-[color:var(--color-maroon-700)]">The Maroon Masters</p>
          <div className="mx-auto mt-3 h-px w-24 bg-[color:var(--color-gold-400)]" />
        </div>
        <div className="bg-gradient-trophy px-8 py-10 text-center">
          <p className="font-condensed text-sm font-bold uppercase tracking-[0.2em] text-[color:var(--color-maroon-900)]/70">Match {box.boxNumber}</p>
          <p className="mt-3 font-condensed text-5xl font-bold uppercase tracking-wide text-[color:var(--color-maroon-900)]">
            {teamLabel(box.leader)} Wins {closedMarginLabel(box.margin, box.holesRemaining)}
          </p>
          <p className="mt-4 font-sans text-lg text-[color:var(--color-maroon-900)]/80">
            {box.maroonNames.join(" / ")} vs. {box.whiteNames.join(" / ")}
          </p>
        </div>
      </div>
    </div>
  );
}
