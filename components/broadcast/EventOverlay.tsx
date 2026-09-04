import { marginLabel, teamLabel, type ActiveBroadcastEvent } from "@/lib/broadcast/eventDisplay";
import type { BroadcastMatchPlay } from "@/lib/broadcast/matchPlayData";
import type { BroadcastTeam } from "@/lib/broadcast/types";

interface MatchStateChangedPayload {
  matchBoxId: string;
  round: number;
  leader: BroadcastTeam | "tie";
  margin: number;
  holesRemaining: number;
}

/**
 * Lower-third banner for a MATCH_STATE_CHANGED event — renders over
 * whatever scene is currently playing, never interrupts rotation. Looks up
 * the match box's names/number in the already-live matchPlay data rather
 * than fetching anything of its own (spec's Rendering section). Renders
 * nothing if the box can't be found (matchPlay hasn't caught up yet, or
 * the event isn't a MATCH_STATE_CHANGED at all) — a null render still
 * counts as "shown" by useBroadcastQueue's own timer, so the queue keeps
 * moving either way.
 */
export function EventOverlay({ event, matchPlay }: { event: ActiveBroadcastEvent | null; matchPlay: BroadcastMatchPlay }) {
  if (!event || event.displayMode !== "overlay") return null;

  const payload = event.payload as unknown as MatchStateChangedPayload;
  const box = matchPlay.matchBoxes.find((b) => b.id === payload.matchBoxId);
  if (!box) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center px-6 pb-8 sm:pb-12">
      <div className="flex max-w-3xl items-center gap-4 rounded-lg bg-[color:var(--color-maroon-900)] px-6 py-3 shadow-xl ring-1 ring-[color:var(--color-gold-400)]/40">
        <span className="shrink-0 font-condensed text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--color-gold-300)]">
          Match {box.boxNumber}
        </span>
        <span className="font-serif text-xl font-semibold text-white sm:text-2xl">
          {teamLabel(payload.leader)} {marginLabel(payload.margin)}
          {payload.holesRemaining > 0 ? `, ${payload.holesRemaining} to play` : ""}
        </span>
      </div>
    </div>
  );
}
