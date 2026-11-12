/**
 * DEV ONLY: the simulator's Home → Team Draft and Home → Match Selection sub-pages. Each Conditional sets one of these
 * keys; draftSimFixture turns them into the sample team draft, roster and match round that Home's draft card and the
 * two rooms show. Pure data (no React, no storage), safe to import anywhere. Nothing here is ever saved.
 */
import type { TeamDraft } from "@/lib/platform/teamDraft";
import { draftWhenLabel, teamDraftSize, teamDraftTeamCount, teamDraftTurn } from "@/lib/platform/teamDraft";
import type { MatchDraftPlayer, MatchDraftRound } from "@/lib/platform/matchDraft";

export const DRAFT_SIM_KINDS = ["off", "team", "match"] as const;
export const DRAFT_WHENS = ["unset", "countdown", "reached"] as const;
export const TEAM_DRAFT_TYPES = ["2 Teams", "Pairs", "3-Ball", "4-Ball"] as const;
/** Every player count any room page offers (each page shows the ones that suit its team type: TEAM_DRAFT_PAGE_COUNTS). */
export const TEAM_DRAFT_PLAYER_COUNTS = [4, 6, 7, 8, 9, 10, 12, 15, 16, 24, 32] as const;
/** Player counts per room page: even fits, plus one that leaves players over (or an odd number for 2 Teams). */
export const TEAM_DRAFT_PAGE_COUNTS: Record<(typeof TEAM_DRAFT_TYPES)[number], (typeof TEAM_DRAFT_PLAYER_COUNTS)[number][]> = {
  "2 Teams": [4, 7, 8, 12, 16], Pairs: [4, 7, 8, 12, 16], "3-Ball": [6, 9, 10, 12, 24], "4-Ball": [8, 10, 12, 16, 32],
};
export const TEAM_DRAFT_PICKED = ["none", "half", "all"] as const;
export const MATCH_SEL_TYPES = ["Response", "Ranks", "Randomized"] as const;
export const MATCH_SEL_PER_TEAM = ["2", "4", "6", "8", "5v4"] as const;

export type DraftSimState = {
  /** Which draft sample Home shows. "off" (or unset) = the trip's own draft settings. */
  draftSim?: (typeof DRAFT_SIM_KINDS)[number];
  /** When the draft is: no date set, a countdown running (about a day away), or the start time just reached. */
  draftWhen?: (typeof DRAFT_WHENS)[number];
  /** Whether the Draft Room / Match Room is open on top of Home. */
  draftRoom?: "closed" | "open";
  /** 2 Teams (A/B columns) or Pairs / 3-Ball / 4-Ball (teams of 2/3/4 with a captain each). */
  teamDraftType?: (typeof TEAM_DRAFT_TYPES)[number];
  teamDraftMethod?: "Captain's Picks" | "Duck Race";
  teamDraftOrder?: "Snake" | "Straight";
  teamDraftPlayers?: (typeof TEAM_DRAFT_PLAYER_COUNTS)[number];
  teamDraftPicked?: (typeof TEAM_DRAFT_PICKED)[number];
  matchSelType?: (typeof MATCH_SEL_TYPES)[number];
  matchSelFormat?: "singles" | "pairs";
  matchSelPerTeam?: (typeof MATCH_SEL_PER_TEAM)[number];
  matchSelLocked?: boolean;
};

/** What a sample uses for any key not picked yet (also what the simulator lights up as chosen). */
export const DRAFT_SIM_DEFAULTS: Required<Omit<DraftSimState, "draftSim">> = {
  draftWhen: "countdown", draftRoom: "closed",
  teamDraftType: "2 Teams", teamDraftMethod: "Captain's Picks", teamDraftOrder: "Snake", teamDraftPlayers: 8, teamDraftPicked: "none",
  matchSelType: "Response", matchSelFormat: "singles", matchSelPerTeam: "4", matchSelLocked: false,
};

/** True when every draft key present is one of its allowed values (the simulator rejects anything else). */
export function validDraftSim(state: Record<string, unknown>): boolean {
  const allowed: [keyof DraftSimState, readonly unknown[]][] = [
    ["draftSim", DRAFT_SIM_KINDS], ["draftWhen", DRAFT_WHENS], ["draftRoom", ["closed", "open"]],
    ["teamDraftType", TEAM_DRAFT_TYPES], ["teamDraftMethod", ["Captain's Picks", "Duck Race"]], ["teamDraftOrder", ["Snake", "Straight"]],
    ["teamDraftPlayers", TEAM_DRAFT_PLAYER_COUNTS], ["teamDraftPicked", TEAM_DRAFT_PICKED],
    ["matchSelType", MATCH_SEL_TYPES], ["matchSelFormat", ["singles", "pairs"]], ["matchSelPerTeam", MATCH_SEL_PER_TEAM],
    ["matchSelLocked", [true, false]],
  ];
  return allowed.every(([key, values]) => state[key] === undefined || values.includes(state[key]));
}

const NAMES = ["Alex Morgan", "Jordan Reed", "Sam Taylor", "Casey Brooks", "Riley Parker", "Jamie Hayes", "Drew Carter", "Morgan Lee",
  "Taylor Quinn", "Avery Cole", "Parker Shaw", "Quinn Ellis", "Reese Grant", "Blake Turner", "Hayden Price", "Rowan Fox",
  "Emery Lane", "Finley Ross", "Harper Wade", "Jesse Kim", "Kendall Hart", "Logan Pierce", "Micah Dunn", "Noel Bishop",
  "Oakley Banks", "Peyton Rhodes", "Sage Whitman", "Tatum Cross", "Wren Holloway", "Arden Blake", "Bailey Knox", "Cameron Vale"];

/** Made-up but believable stats for a sample player with this handicap (better players: lower scores, more birdies). */
export function sampleStats(handicap: number, index: number) {
  const r1 = (value: number) => Math.round(value * 10) / 10;
  const average = r1(72 + handicap * 1.05 + (index % 3) * 0.4);
  return { average, adjusted: r1(average - 1 - handicap * 0.12), ppg: r1(Math.max(0.2, 1.8 - handicap * 0.07 + (index % 2) * 0.1)),
    fairwayPct: Math.max(20, 68 - handicap * 1.6), girPct: Math.max(8, 62 - handicap * 2.4), birdiesPerRound: r1(Math.max(0.1, 3.4 - handicap * 0.17)) };
}

/** "YYYY-MM-DDTHH:mm[:ss]" moved by `seconds` → "YYYY-MM-DDTHH:mm:ss" (trip wall time, no time zone). */
function shift(stamp: string, seconds: number): string {
  return new Date(Date.parse(`${stamp.length === 16 ? `${stamp}:00` : stamp}Z`) + seconds * 1000).toISOString().slice(0, 19);
}
/** The draft's date + time for a "when" choice, measured from `now`. */
function at(when: DraftSimState["draftWhen"], now: string): { date: string; time: string } {
  if (when === "unset") return { date: "", time: "" };
  const stamp = shift(now, when === "reached" ? -60 : 26 * 3600);
  return { date: stamp.slice(0, 10), time: stamp.slice(11, 16) };
}

export type DraftSimFixture = {
  team: TeamDraft;
  /** Everyone on the trip (the Draft Room's list); `team` set = already on a team. */
  players: { name: string; handicap: number; team?: "A" | "B"; teamIndex?: number; captain?: boolean; stats?: ReturnType<typeof sampleStats>; profileHref?: string }[];
  /** Players already on Team A / B (what Match Selection draws from). */
  matchPlayers: MatchDraftPlayer[];
  matchRounds: MatchDraftRound[];
  /** Whether the room opens on top of Home, and a key that changes whenever the sample does (so the room starts fresh). */
  roomKey: string | null;
  /** Names this sample (open or closed), so its picks are kept for the browser tab (profile → back keeps them). */
  sampleKey: string;
};

/** The sample for the chosen draft page, or null when the simulator isn't showing one. `now` = trip wall time. */
export function draftSimFixture(state: DraftSimState, now: string): DraftSimFixture | null {
  if (!state.draftSim || state.draftSim === "off") return null;
  const s = { ...DRAFT_SIM_DEFAULTS, ...state };
  const key = JSON.stringify([s.draftSim, s.draftWhen, s.teamDraftType, s.teamDraftMethod, s.teamDraftOrder, s.teamDraftPlayers, s.teamDraftPicked,
    s.matchSelType, s.matchSelFormat, s.matchSelPerTeam, s.matchSelLocked]);
  const roomKey = s.draftRoom === "open" ? key : null;
  if (s.draftSim === "team") {
    // Pairs / 3-Ball / 4-Ball: the first player of each team is its captain. Then "half" / "all" of the open spots are
    // filled in real draft order (Snake or Straight), so whose turn it is matches what the room expects.
    const size = teamDraftSize(s.teamDraftType);
    const teams = teamDraftTeamCount(s.teamDraftType, s.teamDraftPlayers);
    const on: (number | undefined)[] = Array.from({ length: s.teamDraftPlayers }, (_, index) => size && index < teams ? index : undefined);
    const start = Array.from({ length: teams }, () => size ? 1 : 0);
    const open = size ? teams * size - teams : s.teamDraftPlayers;
    const toPick = s.teamDraftPicked === "all" ? open : s.teamDraftPicked === "half" ? Math.floor(open / 2) : 0;
    const counts = [...start];
    for (let pick = 0, next = size ? teams : 0; pick < toPick && next < s.teamDraftPlayers; pick++, next++) {
      const team = teamDraftTurn(s.teamDraftOrder, counts, start, size ?? Infinity);
      if (team === null) break;
      on[next] = team; counts[team]++;
    }
    // Every third sample player has a Private profile, the rest Public (their box opens the matching sample profile).
    const players: DraftSimFixture["players"] = NAMES.slice(0, s.teamDraftPlayers).map((name, index) => ({ name, handicap: 4 + index, stats: sampleStats(4 + index, index),
      profileHref: index % 3 === 2 ? "/dev/profile?view=private" : "/dev/profile?view=public",
      ...(on[index] !== undefined ? size ? { teamIndex: on[index], captain: index < teams } : { team: on[index] ? "B" as const : "A" as const } : {}) }));
    return {
      team: { teamType: s.teamDraftType, selection: "Draft", ...at(s.draftWhen, now), type: s.teamDraftOrder, method: s.teamDraftMethod },
      players, roomKey, sampleKey: key, matchRounds: [],
      // Match Selection is for 2 Teams only.
      matchPlayers: size ? [] : players.flatMap((player, index) => player.team ? [{ id: String(index), name: player.name, handicap: player.handicap, team: player.team }] : []),
    };
  }
  // Match Selection: the team draft is already done (2 hours ago), so both teams are set.
  const [sizeA, sizeB] = s.matchSelPerTeam === "5v4" ? [5, 4] : [Number(s.matchSelPerTeam), Number(s.matchSelPerTeam)];
  const players = NAMES.slice(0, sizeA + sizeB).map((name, index) => ({ name, handicap: 4 + index, team: index < sizeA ? "A" as const : "B" as const }));
  const perSide = s.matchSelFormat === "pairs" ? 2 : 1;
  const { date, time } = at(s.draftWhen, now);
  const teamAt = shift(now, -2 * 3600);
  return {
    team: { teamType: "2 Teams", selection: "Draft", date: teamAt.slice(0, 10), time: teamAt.slice(11, 16), type: "Snake", method: "Captain's Picks" },
    players, roomKey, sampleKey: key,
    matchPlayers: players.map((player, index) => ({ id: String(index), ...player })),
    matchRounds: [{
      key: "sim-match-" + s.matchSelType + "-" + s.matchSelFormat + "-" + s.matchSelPerTeam + (s.matchSelLocked ? "-locked" : ""),
      number: 2, course: "Troon North · Monument", format: perSide === 2 ? "Fourball" : "Singles", perSide,
      matches: Math.floor(Math.min(sizeA, sizeB) / perSide), type: s.matchSelType,
      rankMinutes: 10, putForwardMinutes: 10, responseMinutes: 10,
      date, time, when: date ? draftWhenLabel(date, time) : "Draft date not set yet", locked: s.matchSelLocked,
    }],
  };
}
