import Link from "next/link";
import { LoadingScreen } from "@/components/LoadingScreen";
import { matchupLabel, type CurrentSessionResult } from "@/lib/live/currentRoundForPlayer";
import { scoringSides } from "@/lib/live/holeSubmission";
import type { ScoringStage } from "@/lib/live/scoringStage";
import { stageButtonLabel, stageNote } from "@/lib/live/scoringStageCopy";
import { getPlayerDisplayName } from "@/lib/data/players";
import { nextTournament } from "@/lib/data";

function formatTeeTime(date: Date): string {
  return `${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })} PT`;
}

/**
 * The Scoring landing screen for the player's current round: the full
 * matchup (who you play, who you are scoring for) and a Begin / Continue /
 * View button that opens live scoring. Progress is saved on the server hole
 * by hole, so leaving and coming back never loses anything.
 */
export function ScoringStatusScreen({
  playerName,
  playerSlug,
  result,
  stage,
  progress,
}: {
  playerName: string;
  playerSlug: string;
  result: CurrentSessionResult | null;
  stage: ScoringStage;
  progress: { holesEntered: number; waitingOn: string[]; courseName: string | null } | null;
}) {
  const topSlot = <>Welcome, {playerName}</>;

  if (!result || stage === "none") {
    return (
      <LoadingScreen heading={`Maroon Masters ${nextTournament.year}`} topSlot={topSlot}>
        <p className="font-sans text-lg text-cream-50/90">Waiting For Matchup</p>
      </LoadingScreen>
    );
  }

  const { matchBox, session } = result;
  const scoring = scoringSides(matchBox, playerSlug).opponents.map(getPlayerDisplayName).join(" & ");
  const heading = stage === "upcoming" ? "Upcoming Round" : stage === "submitted" ? "Round Submitted" : "Round Live";
  const note = stageNote(stage, { holesEntered: progress?.holesEntered ?? 0, waitingNames: (progress?.waitingOn ?? []).map(getPlayerDisplayName) });
  const label = stageButtonLabel(stage);

  return (
    <LoadingScreen heading={heading} topSlot={topSlot} raised>
      <p className="font-sans text-base text-cream-50/80">Session {session.session} &middot; {matchBox.format}{progress?.courseName ? ` · ${progress.courseName}` : ""}</p>
      <p className="font-sans text-lg text-cream-50/90">{formatTeeTime(matchBox.teeTime)}</p>
      <p className="font-sans text-base text-cream-50/80">{matchupLabel(playerSlug, matchBox)}</p>
      {scoring && <p className="font-sans text-sm text-cream-50/80">You are scoring: {scoring}</p>}
      {stage === "upcoming" ? (
        <div className="mt-4 flex h-16 w-40 items-center justify-center rounded-md border-2 border-cream-50/40">
          <span className="font-condensed text-sm font-bold uppercase tracking-wide text-cream-50">{label}</span>
        </div>
      ) : (
        <Link href="/portal/scoring/play" className="mt-4 flex h-16 w-40 items-center justify-center rounded-md border-2 border-cream-50 bg-cream-50">
          <span className="font-condensed text-sm font-bold uppercase tracking-wide text-maroon-700">{label}</span>
        </Link>
      )}
      {note && <p className="font-sans text-sm text-cream-50/80">{note}</p>}
    </LoadingScreen>
  );
}
