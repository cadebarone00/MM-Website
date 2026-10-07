/**
 * One competition round's settings (Competition → Format → a round) and the points math built on them.
 * Preview only: nothing here is stored or scored yet.
 */

/** Formats from the competition chart: how many players each side of a match has, a one-line summary and the basic rules. */
export const ROUND_FORMATS = [
  { name: "Singles", perSide: 1, summary: "1 v 1, everyone plays their own ball.", rules: [
    "Two players go head to head.",
    "Each plays their own ball the whole hole.",
    "Lower score wins the hole; the same score halves (ties) it.",
    "Whoever wins more holes wins the match.",
  ] },
  { name: "Fourball", perSide: 2, summary: "2 v 2 best ball.", rules: [
    "Two players per side, each playing their own ball.",
    "On every hole, only the better score of each pair counts.",
    "Lower team score wins the hole; the same score halves it.",
    "Also called Best Ball.",
  ] },
  { name: "Alternate Shot", perSide: 2, summary: "2 v 2, one ball per side, partners take turns.", rules: [
    "Each side plays one ball and the partners alternate shots until it's holed.",
    "One partner tees off on the odd holes, the other on the even holes.",
    "Lower team score wins the hole.",
    "Also called Foursomes.",
  ] },
  { name: "Chapman", perSide: 2, summary: "2 v 2, both drive, swap, pick one, then alternate.", rules: [
    "Both partners tee off.",
    "They swap balls and each hits the partner's ball for the second shot.",
    "The side picks the better ball, and the partners alternate shots with it until it's holed.",
    "Lower team score wins the hole. Also called Pinehurst.",
  ] },
  { name: "Scramble", perSide: 2, summary: "Team picks the best shot every time.", rules: [
    "Every player on the side hits.",
    "The side picks the best shot, and everyone plays their next shot from that spot.",
    "Repeat until the ball is holed; the side records one score.",
    "Lower team score wins the hole.",
  ] },
  { name: "Shamble", perSide: 2, summary: "Best drive, then everyone plays their own ball.", rules: [
    "Every player on the side tees off and the side picks the best drive.",
    "From there, each player plays their own ball into the hole.",
    "The side's best score on the hole counts.",
    "Lower team score wins the hole.",
  ] },
  { name: "Stroke Play", perSide: 1, summary: "Count every shot; lowest total wins.", rules: [
    "Every player plays their own ball and counts every stroke.",
    "Add up the strokes for the whole round.",
    "Lowest total wins.",
    "With handicap, strokes are taken off to give a net score.",
  ] },
  { name: "Stableford", perSide: 1, summary: "Points for each hole's score; most points wins.", rules: [
    "Each hole earns points from the score compared with par.",
    "Double bogey or worse 0 · Bogey 1 · Par 2 · Birdie 3 · Eagle 4 · Albatross 5.",
    "Add the points for the round.",
    "Most points wins.",
  ] },
] as const;
export type RoundFormat = (typeof ROUND_FORMATS)[number]["name"];

export const MATCH_TYPES = ["Match Play", "Stroke Play"] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

export const SCORING_OPTIONS = ["Gross", "Net", "Both"] as const;
export type Scoring = (typeof SCORING_OPTIONS)[number];

export type RoundCompSettings = {
  /** Players playing in this round's competition. */
  players: number;
  /** Points one match is worth (per Nassau segment when Nassau is on). */
  pointsPerMatch: number;
  matchType: MatchType;
  /** Nassau: front 9, back 9 and overall each pay the match's points. */
  nassau: boolean;
  scoring: Scoring;
  format: RoundFormat;
};

export function defaultRoundComp(players: number): RoundCompSettings {
  return { players, pointsPerMatch: 1, matchType: "Match Play", nassau: false, scoring: "Gross", format: "Singles" };
}

export function playersPerSide(format: RoundFormat): number {
  return ROUND_FORMATS.find(item => item.name === format)?.perSide ?? 1;
}

/** Match play: every match is two sides of the format's size. Stroke play has no matches. */
export function roundMatches(settings: RoundCompSettings): number {
  if (settings.matchType !== "Match Play") return 0;
  return Math.floor(Math.max(0, settings.players) / (playersPerSide(settings.format) * 2));
}

/** Players left over after the matches are filled (they don't fit a full match). */
export function playersLeftOver(settings: RoundCompSettings): number {
  if (settings.matchType !== "Match Play") return 0;
  return Math.max(0, settings.players) - roundMatches(settings) * playersPerSide(settings.format) * 2;
}

/** What one match pays in total: its points, times 3 with Nassau (front, back, overall). */
export function pointsPerMatchTotal(settings: RoundCompSettings): number {
  return settings.pointsPerMatch * (settings.nassau ? 3 : 1);
}

/** Total points available this round = matches × what each match pays. */
export function roundPointsAvailable(settings: RoundCompSettings): number {
  return roundMatches(settings) * pointsPerMatchTotal(settings);
}

/** A tee time holds up to 4 players: two 1 v 1 matches, or one 2 v 2 match. */
export function matchesPerTeeTime(format: RoundFormat): number {
  return Math.max(1, Math.floor(4 / (playersPerSide(format) * 2)));
}

/** Tee times a match-play round needs for all its matches (16 players of Fourball = 4 matches = 4 tee times). */
export function teeTimesNeeded(settings: RoundCompSettings): number {
  return Math.ceil(roundMatches(settings) / matchesPerTeeTime(settings.format));
}
