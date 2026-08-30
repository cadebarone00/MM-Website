import { LoadingScreen } from "@/components/LoadingScreen";
import { matchupLabel, type CurrentRoundResult } from "@/lib/live/currentRoundForPlayer";
import { nextTournament } from "@/lib/data";

function formatTeeTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
}

/**
 * The three states of the Scoring landing screen (see
 * docs/superpowers/specs/2026-08-29-player-area-nav-scoring-design.md):
 * no round yet, an upcoming (not-yet-live) round, and a live round. The
 * actual hole-by-hole scoring entry screen doesn't exist yet — tapping the
 * Scorecard box does nothing for now.
 */
export function ScoringStatusScreen({
  playerName,
  playerSlug,
  result,
}: {
  playerName: string;
  playerSlug: string;
  result: CurrentRoundResult | null;
}) {
  const topSlot = <>Welcome, {playerName}</>;

  if (!result) {
    return (
      <LoadingScreen heading={`Maroon Masters ${nextTournament.year}`} topSlot={topSlot}>
        <p className="font-sans text-lg text-cream-50/90">Waiting For Matchup</p>
      </LoadingScreen>
    );
  }

  const { matchBox, state } = result;
  const live = state === "Live";

  return (
    <LoadingScreen heading={live ? "Round Live" : "Upcoming Round"} topSlot={topSlot} raised>
      <p className="font-sans text-lg text-cream-50/90">{formatTeeTime(matchBox.teeTime)}</p>
      <p className="font-sans text-base text-cream-50/80">{matchupLabel(playerSlug, matchBox)}</p>
      <div
        className={[
          "mt-4 flex h-16 w-40 items-center justify-center rounded-md border-2",
          live ? "border-cream-50 bg-cream-50" : "border-cream-50/40",
        ].join(" ")}
      >
        <span
          className={[
            "font-condensed text-sm font-bold uppercase tracking-wide",
            live ? "text-maroon-700" : "text-cream-50",
          ].join(" ")}
        >
          Scorecard
        </span>
      </div>
      {!live && <p className="font-sans text-sm text-cream-50/80">Waiting For Round To Begin</p>}
    </LoadingScreen>
  );
}
