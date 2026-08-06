export type FeedRecord = Record<string, unknown>;
export type MatchLeader = "maroon" | "white" | "tie";

export type WebsiteMatch = {
  id: string;
  day: number;
  session: "Morning" | "Afternoon";
  format: string;
  maroonPlayers: string[];
  whitePlayers: string[];
  maroonPts: number;
  whitePts: number;
  status: "scheduled" | "live" | "final";
  thru?: number;
  leader?: MatchLeader;
  margin?: number;
  holesRemaining?: number;
  teeTimeCst?: string;
};

export function asRecord(value: unknown): FeedRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as FeedRecord) : {};
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function asNumber(value: unknown, fallback = 0): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function asSession(value: unknown): "Morning" | "Afternoon" {
  return String(value).toLowerCase() === "afternoon" ? "Afternoon" : "Morning";
}

export function asLeader(value: unknown): MatchLeader {
  const leader = String(value ?? "tie").toLowerCase();
  if (leader === "maroon" || leader === "white") return leader;
  return "tie";
}

export function mapStatus(value: unknown): "scheduled" | "live" | "final" {
  const state = String(value ?? "").toLowerCase();
  if (state.includes("final")) return "final";
  if (state.includes("live")) return "live";
  return "scheduled";
}

export function parseThru(value: unknown): number | undefined {
  if (typeof value === "number" && value > 0) return value;
  const match = String(value ?? "").match(/\d+/);
  if (!match) return undefined;
  const thru = Number(match[0]);
  return Number.isFinite(thru) && thru > 0 ? thru : undefined;
}

export function formatCentralTime(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  }).format(date);

  return `${time} CST`;
}

export function normalizeMatch(item: unknown, index: number): WebsiteMatch {
  const match = asRecord(item);
  const id = String(match.id ?? `${match.year ?? "2027"}-${match.day ?? 1}-${match.session ?? "Morning"}-${match.boxNumber ?? index + 1}`);

  return {
    id,
    day: asNumber(match.day, 1),
    session: asSession(match.session),
    format: String(match.format ?? "Fourball"),
    maroonPlayers: asStringArray(match.maroonPlayers ?? match.maroon_players),
    whitePlayers: asStringArray(match.whitePlayers ?? match.white_players),
    maroonPts: asNumber(match.maroonPts ?? match.maroon_points),
    whitePts: asNumber(match.whitePts ?? match.white_points),
    status: mapStatus(match.state ?? match.status),
    thru: parseThru(match.thru),
    leader: asLeader(match.leader),
    margin: asNumber(match.margin),
    holesRemaining: asNumber(match.holesRemaining ?? match.holes_remaining, 18),
    teeTimeCst: formatCentralTime(match.teeTime ?? match.tee_time ?? match.teeTimeCst),
  };
}

export function normalizePayload(data: unknown) {
  const feed = asRecord(data);
  const rawMatches = Array.isArray(feed.matchBoxes) ? feed.matchBoxes : Array.isArray(feed.matches) ? feed.matches : [];
  const matches = rawMatches.map(normalizeMatch);

  return {
    ...feed,
    updatedAt: typeof feed.updatedAt === "string" ? feed.updatedAt : new Date().toISOString(),
    individualLeaderboard: Array.isArray(feed.individualLeaderboard) ? feed.individualLeaderboard : Array.isArray(feed.leaderboard) ? feed.leaderboard : [],
    scorecards: Array.isArray(feed.scorecards) ? feed.scorecards : [],
    maroonPts: asNumber(feed.maroonPts ?? feed.maroon_points),
    whitePts: asNumber(feed.whitePts ?? feed.white_points),
    matches,
    matchBoxes: rawMatches,
  };
}
