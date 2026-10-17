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
  /** Individual leaderboard, in leaderboard order (`liveLeaderboard()` picks the 3 rows shown). Empty = no leaderboard. */
  leaderboard?: LeaderboardRow[];
  /** While over: the next round's course. */
  nextCourse?: string | null;
  /** Team competition: my team first. Color is the team's color (text color in the Dynamic Island). Null = no teams. */
  teams?: { mine: TeamScore; other: TeamScore } | null;
  /** Where the round is (spec: Live Activity lifecycle): pre = popped up 60 min before tee time; live = the organizer
   *  started the round; over = everyone in the group submitted (next round still to come); final = after the last round. */
  state: "pre" | "live" | "over" | "final";
  /** Trip-local tee time "YYYY-MM-DDTHH:mm": this round's while pre, the next round's while over. Null = none set. */
  teeTime: string | null;
  /** My finished match, e.g. "W 3&2", "L 2&1", "Halved". Null until the match is over. */
  result: string | null;
  /** ISO time of the last score. */
  updatedAt: string;
};

export type TeamScore = { name: string; color: string; points: number };

/** One leaderboard line: position as the leaderboard shows it ("1", "T2"), whole-tournament score to par. */
export type LeaderboardRow = { position: string; name: string; toPar: number; me: boolean };
