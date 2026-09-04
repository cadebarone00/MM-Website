import { buildLiveTournamentSnapshot } from "@/lib/broadcast/liveSnapshot";
import { getLiveCareerArchiveRecords, getLiveCareerArchiveTeamRecords } from "@/lib/data/careerStatsDatabase";
import { careerArchiveCourseHoles, careerArchiveRecords, careerArchiveTeamRecords } from "@/lib/data/careerArchive.generated";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import type { CareerCourseHole, CareerHoleRecord } from "@/lib/data/careerStats";
import { calculatePreRoundAlternateShotOdds, calculatePreRoundFourballOdds, calculatePreRoundSinglesOdds, type PreRoundSinglesResult } from "@/lib/odds/preRoundSingles";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { LiveMatchBox } from "@/lib/live/types";
import type { OfficialMatchState } from "@/lib/live/officialMatchState";
import { isTestSeason } from "@/lib/live/testSeason";

export const LIVE_MATCH_ODDS_MODEL_VERSION = "match-monte-carlo-v1";

function fairAmericanOdds(probability: number): number | null {
  if (probability <= 0 || probability >= 1) return null;
  return probability >= 0.5 ? -Math.round((100 * probability) / (1 - probability)) : Math.round((100 * (1 - probability)) / probability);
}

function modelPlayer(slug: string): string {
  return getPlayerProfileBySlug(slug)?.id ?? slug;
}

function recordWithModelPlayer(row: CareerHoleRecord): CareerHoleRecord {
  return { ...row, player: getPlayerProfileBySlug(row.player)?.id ?? row.player };
}

/** Builds and persists the single odds output consumed by all live surfaces. */
export async function publishMatchOdds(seasonYear: number, box: LiveMatchBox, state: OfficialMatchState): Promise<PreRoundSinglesResult | null> {
  const snapshot = await buildLiveTournamentSnapshot(seasonYear, { confirmedOnly: true });
  const course = snapshot.courses[snapshot.roundCourses[box.round]];
  if (!course) return null;
  const courseHoles: CareerCourseHole[] = course.holes.map((hole) => ({ year: seasonYear, course: course.name, tee: null, hole: hole.number, par: hole.par, yards: hole.yards, holeType: `Par ${hole.par}`, holeLengthBucket: null }));
  const [liveArchiveRecords, liveArchiveTeamRecords] = await Promise.all([
    getLiveCareerArchiveRecords({ includeTestSeason: isTestSeason(seasonYear) }),
    getLiveCareerArchiveTeamRecords({ includeTestSeason: isTestSeason(seasonYear) }),
  ]);
  const liveRecords = liveArchiveRecords.map(recordWithModelPlayer);
  const records = [...careerArchiveRecords, ...liveRecords];
  const teamRecords = [...careerArchiveTeamRecords, ...liveArchiveTeamRecords.map((row) => ({
    ...row,
    player1: modelPlayer(row.player1),
    player2: modelPlayer(row.player2),
  }))];
  const a = box.maroonPlayers.map(modelPlayer);
  const b = box.whitePlayers.map(modelPlayer);
  const scores = snapshot.scores;
  const score = (player: string, hole: number) => scores.get(`${player}:${box.round}:${hole}`)?.score ?? null;
  let result: PreRoundSinglesResult | null = null;

  if (box.format === "Singles" && a.length === 1 && b.length === 1) {
    const completedScores = Array.from({ length: state.thru }, (_, index) => {
      const hole = index + 1;
      const setup = course.holes.find((candidate) => candidate.number === hole)!;
      return { a: score(box.maroonPlayers[0], hole)!, b: score(box.whitePlayers[0], hole)!, par: setup.par };
    });
    result = calculatePreRoundSinglesOdds({ records, courseHoles: [...careerArchiveCourseHoles, ...courseHoles], playerA: a[0], playerB: b[0], course: course.name, holesFinished: state.thru, playerALead: state.leader === "maroon" ? state.margin : state.leader === "white" ? -state.margin : 0, completedScores });
  } else if (box.format === "Fourball" && a.length === 2 && b.length === 2) {
    const completedScores = Array.from({ length: state.thru }, (_, index) => {
      const hole = index + 1;
      const setup = course.holes.find((candidate) => candidate.number === hole)!;
      return { a1: score(box.maroonPlayers[0], hole)!, a2: score(box.maroonPlayers[1], hole)!, b1: score(box.whitePlayers[0], hole)!, b2: score(box.whitePlayers[1], hole)!, par: setup.par };
    });
    result = calculatePreRoundFourballOdds({ records, courseHoles: [...careerArchiveCourseHoles, ...courseHoles], teamA: [a[0], a[1]], teamB: [b[0], b[1]], course: course.name, holesFinished: state.thru, teamALead: state.leader === "maroon" ? state.margin : state.leader === "white" ? -state.margin : 0, completedScores });
  } else if (box.format === "Foursome" && a.length === 2 && b.length === 2) {
    result = calculatePreRoundAlternateShotOdds({ records, teamRecords, courseHoles: [...careerArchiveCourseHoles, ...courseHoles], teamA: [a[0], a[1]], teamB: [b[0], b[1]], course: course.name, holesFinished: state.thru, teamALead: state.leader === "maroon" ? state.margin : state.leader === "white" ? -state.margin : 0 });
  }
  if (!result) return null;

  const service = createSupabaseServiceRoleClient();
  const { error } = await service.from("live_match_odds_snapshots").insert({
    match_box_id: box.id,
    season_year: seasonYear,
    model_version: LIVE_MATCH_ODDS_MODEL_VERSION,
    state_thru: state.thru,
    maroon_lead: state.leader === "maroon" ? state.margin : state.leader === "white" ? -state.margin : 0,
    maroon_win_probability: result.a,
    tie_probability: result.tie,
    white_win_probability: result.b,
    maroon_american_odds: fairAmericanOdds(result.a),
    tie_american_odds: fairAmericanOdds(result.tie),
    white_american_odds: fairAmericanOdds(result.b),
    details: { measureOneMinimum: result.measureOneMinimum, measureTwoMinimum: result.measureTwoMinimum, formatDeltas: result.formatDeltas },
  });
  if (error) throw error;
  await service.from("live_score_audit_events").insert({ season_year: seasonYear, match_box_id: box.id, round: box.round, kind: "odds_snapshot_created", payload: { modelVersion: LIVE_MATCH_ODDS_MODEL_VERSION, thru: state.thru } });
  return result;
}
