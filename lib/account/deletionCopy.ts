/**
 * Wording for Settings → Delete account (pure, unit-tested). The one hard rule: nothing says the account IS deleted
 * until every step (database, Storage, login) has been confirmed: state "completed". Earlier states say "closed".
 * Wording about legal retention is deliberately factual and provisional (docs/account-deletion-implementation-*.md, D7).
 */
export type TripOutcome = "transfer" | "archive" | "restrict";
export type HandoffState = "pending" | "accepted" | "declined";
export type TripPlanLike = { name: string; ended: boolean; outcome: TripOutcome; handoff: { toName: string; state: HandoffState } | null };

export function tripOutcomeText(trip: TripPlanLike): string {
  if (trip.outcome === "transfer" && trip.handoff) return `${trip.handoff.toName} accepted and will become the organizer.`;
  if (trip.outcome === "archive") return "This trip has ended, so it will be archived. Everyone keeps their scores; nothing more can be changed.";
  const waiting = trip.handoff?.state === "pending" ? `Waiting for ${trip.handoff.toName} to accept. ` : "";
  const declined = trip.handoff?.state === "declined" ? `${trip.handoff.toName} declined. ` : "";
  return `${declined}${waiting}If nobody has accepted when you delete your account, the trip becomes read-only with no organizer: members keep their trip and scores, but organizer changes stop.`;
}

export type DeletionCounts = { tripsJoined: number; sharedRoundsHosted: number; tournamentRoles: number; legacyPlayer: boolean; personalRounds: number;
  sharedRounds: number; scorecards: number; openBets: number; files: number };

/** "Deleted" and "Kept, without your name" lists for the preview. */
export function deletionSummary(counts: DeletionCounts): { deleted: string[]; kept: string[] } {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  const deleted = [
    "Your login, email address and password",
    "Your profile: name, username, bio and photo",
    ...(counts.files ? [n(counts.files, "uploaded file", "uploaded files")] : []),
    ...(counts.personalRounds ? [n(counts.personalRounds, "personal round", "personal rounds")] : []),
    "Your flights, travel plans and notification settings",
    ...(counts.openBets ? [n(counts.openBets, "open MM Coins bet (cancelled)", "open MM Coins bets (cancelled)")] : []),
    "Your MM Coins balance",
    ...(counts.tournamentRoles ? [n(counts.tournamentRoles, "tournament admin role", "tournament admin roles")] : []),
  ];
  const kept = [
    ...(counts.sharedRounds || counts.scorecards ? ["Scores and scorecards from trips and tournaments you played, so other players' results stay correct"] : []),
    ...(counts.tripsJoined ? [n(counts.tripsJoined, "trip you joined", "trips you joined") + ": you'll show as “Former member”"] : []),
    ...(counts.sharedRoundsHosted ? [n(counts.sharedRoundsHosted, "round you're hosting ends", "rounds you're hosting end") + "; everyone's scores stay"] : []),
    ...(counts.legacyPlayer ? ["Your old Maroon player record: unlinked from you and locked, so nobody else can claim it"] : []),
  ];
  return { deleted, kept };
}

export type DeletionState = "requested" | "database_done" | "storage_done" | "auth_done" | "completed";

export function resultMessage(state: DeletionState): { title: string; body: string; done: boolean } {
  if (state === "completed") {
    return { done: true, title: "Your account has been deleted",
      body: "Your login, personal details, photos and personal data are gone. Shared scores remain only as “Former member”." };
  }
  return { done: false, title: "Your account is closed",
    body: "You've been signed out and the account can't be used any more. We're finishing the deletion in the background, which usually takes a few minutes. You don't need to do anything else." };
}
