/**
 * One notification shape for every surface: the phone notification (push payload), the bell list and the top banner.
 * Spec: project_specs.md → "Notifications — native App Store app".
 */
export const NOTIFICATION_KINDS = [
  "highlight", "teeTime", "opponentSubmitted", "cardMismatch", "roundFinal",
  "joinRequest", "requestAccepted", "requestDeclined", "invited", "linkRequest",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** In-app path opened on tap, e.g. "/golf-trips/<id>#momentum". */
  link: string;
  /** The group (trip / tournament) it belongs to. Phone notifications from one group stack together. */
  groupId: string;
  groupName: string;
  /** ISO time. */
  createdAt: string;
  read: boolean;
};

/** What the Live Activity shows during a live round. The Swift widget decodes `liveActivityContent()` of this. */
export type LiveRoundActivity = {
  groupId: string;
  groupName: string;
  round: number;
  course: string;
  playerName: string;
  /** Strokes against par so far (−2 = two under). */
  toPar: number;
  /** Holes finished so far. */
  thru: number;
  holes: 9 | 18;
  /** Leaderboard spot, e.g. "T2". Null when the trip has no leaderboard. */
  position: string | null;
  /** Match play: status from my side ("2 UP", "AS", "1 DN") and the opponent. Null when not in a match. */
  match: { status: string; opponent: string } | null;
  state: "live" | "final";
  /** ISO time of the last score. */
  updatedAt: string;
};
