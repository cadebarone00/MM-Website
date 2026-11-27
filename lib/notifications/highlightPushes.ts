import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { BUILT_IN_HIGHLIGHTS } from "@/lib/highlights/builtIn";
import { activeConfigFromJson } from "@/lib/highlights/configRows";
import type { HighlightConfig } from "@/lib/highlights/types";
import { detectionSetup } from "@/lib/highlights/detect/roundPars";
import { runShadow } from "@/lib/highlights/detect/shadow";
import { competitionProfile, type CompetitionSetup } from "@/lib/highlights/engine/competition";
import { validSetup } from "@/lib/platform/savedTripSetup";
import { tripRoundMatches } from "@/lib/platform/tripRoundMatches";
import { selectionTeamsFrom } from "@/lib/platform/matchSelectionSetup";
import { defaultRoundComp, type RoundCompSettings } from "@/lib/platform/roundCompetition";
import { getTripRoundScoring } from "@/lib/platform/tripScoringServer";
import { tripSchedule } from "@/lib/platform/tripScheduleView";
import { matchOutcomes } from "@/lib/highlights/detect/matchMoments";
import type { TeamDetectionInput, TeamRound } from "@/lib/highlights/detect/teamMoments";
import type { TripRoundScoring } from "@/lib/platform/tripScoring";
import { sendPush } from "./pushServer.ts";

/**
 * The Highlights engine, LIVE (project_specs.md "Expo app Step 6", part 6e; owner decision 2026-11-27: switch now, no
 * practice run). After a trip score saves, the engine looks at the whole round with the PUBLISHED sheet (Admin Center →
 * Highlights, or the app's BUILT-IN highlights when nothing is published, lib/highlights/builtIn.ts): the detectors find the moments (birdie streaks from 3, eagles, albatrosses, hole in one), the engine
 * decides per trip member who hears each one and in which approved words (the same decision the simulator shows:
 * competition, audience, categories, intensity, approval, placeholders, volume limit). Each moment goes out once
 * (push_reminders_sent "hl:<key>"), only moments from the last 20 minutes, and Settings → Notifications → Big moments can
 * turn them off. Never waits; a failure never touches the score that was saved.
 */
const db = () => createSupabaseServiceRoleClient();
const RECENT_MS = 20 * 60_000;

/**
 * The trip's team competition for the team highlights: only when the setup says "2 Teams" and two teams are set; every
 * match-play round's matches and how they stand (this round from the save, the others loaded as the saving golfer).
 */
async function teamInput(tripId: string, profileId: string, values: Record<string, unknown>, basis: never, placeIds: (string | null)[], scoring: TripRoundScoring, names: Map<string, string>): Promise<TeamDetectionInput | undefined> {
  const teams = selectionTeamsFrom(values, placeIds.map((id) => id ?? ""));
  if (!teams) return undefined;
  const rounds: TeamRound[] = [];
  for (const slot of tripSchedule(values, basis).slots) {
    const comp = (values.compFormats as Record<string, RoundCompSettings> | undefined)?.[slot.key] ?? defaultRoundComp(0);
    const matches = tripRoundMatches(values, basis, slot.number, placeIds);
    if (comp.matchType !== "Match Play" || !matches.length) continue;
    const roundScoring = slot.number === scoring.roundNumber ? scoring : await getTripRoundScoring(profileId, tripId, slot.number);
    const usable = roundScoring && roundScoring !== "failed" ? roundScoring : null;
    const outcomes = usable ? matchOutcomes({ tripId, scoring: usable, matches, startHoles: detectionSetup(usable).startHoles })
      : matches.map((m) => ({ index: m.index, a: m.a, b: m.b, result: null, endedAt: null, upAfter9: null, at9: null }));
    rounds.push({ roundNumber: slot.number, roundId: usable?.roundId ?? slot.key, pointsPerMatch: comp.pointsPerMatch > 0 ? comp.pointsPerMatch : 1, outcomes });
  }
  return rounds.length ? { tripId, teams: [{ name: teams.teamNames[0], ids: teams.rosters[0] }, { name: teams.teamNames[1], ids: teams.rosters[1] }], rounds, names } : undefined;
}

/** The highlights in use: a version published in the Highlights Admin wins; otherwise the app's built-in ones. */
export async function activeHighlights(): Promise<{ version: number | null; config: HighlightConfig } | null> {
  const published = activeConfigFromJson((await db().rpc("get_active_highlight_config", {})).data);
  return published ?? (BUILT_IN_HIGHLIGHTS ? { version: null, config: BUILT_IN_HIGHLIGHTS } : null);
}

async function sendHighlights(tripId: string, scoring: TripRoundScoring, profileId: string | null): Promise<number> {
  const active = await activeHighlights();
  if (!active) return 0;
  const [{ data: setupRow }, { data: memberRows }] = await Promise.all([
    db().from("golf_trip_setup").select("settings, basis").eq("golf_trip_id", tripId).maybeSingle(),
    db().from("golf_trip_members").select("profile_id, display_name, role, invitation_status").eq("golf_trip_id", tripId).order("created_at"),
  ]);
  const comp = ((setupRow as { settings?: { localCompetitionType?: { individual?: unknown; team?: unknown } } } | null)?.settings?.localCompetitionType) ?? {};
  const setup: CompetitionSetup = {
    individual: comp.individual === "Stroke Play" || comp.individual === "Points Based" ? comp.individual : comp.individual ? "Stroke Play" : null,
    team: ["2 Teams", "Pairs", "3-Ball", "4-Ball"].includes(comp.team as string) ? comp.team as CompetitionSetup["team"] : null,
  };
  const rows0 = (memberRows ?? []) as { profile_id: string | null; display_name: string | null; role: string; invitation_status: string }[];
  const members = rows0
    .filter((m) => m.profile_id && (m.role === "organizer" || m.invitation_status === "accepted"))
    .map((m) => ({ id: m.profile_id as string, name: m.display_name?.trim() || "A golfer" }));
  if (!members.length) return 0;

  // The round's matches (match play), for the match-play highlights. Player numbers = places in members by join order.
  const saved = setupRow as { settings?: Record<string, unknown>; basis?: { startDate?: string; rounds?: unknown[] } | null } | null;
  const placeIds = rows0.map((m) => (m.role === "organizer" || m.invitation_status === "accepted" ? m.profile_id : null));
  const matches = saved?.settings && saved.basis?.startDate && Array.isArray(saved.basis.rounds) && validSetup(saved.settings)
    ? tripRoundMatches(saved.settings, saved.basis as never, scoring.roundNumber, placeIds) : [];
  // A round with matches is a match-play competition for the engine's eligibility, even if the trip-level setup says otherwise.
  if (matches.length && !setup.team) setup.team = "Pairs";

  const names = new Map(members.map((m) => [m.id, m.name]));
  const team = setup.team === "2 Teams" && profileId && saved?.settings && saved.basis && validSetup(saved.settings)
    ? await teamInput(tripId, profileId, saved.settings, saved.basis as never, placeIds, scoring, names) : undefined;

  const { pars, startHoles } = detectionSetup(scoring);
  const report = runShadow({ detection: { tripId, scoring, pars, course: null, startHoles, matches, team }, config: active.config, configVersion: active.version, competition: competitionProfile(setup), members });
  const now = Date.now();
  let sent = 0;
  for (const moment of report.moments) {
    if (!(now - Date.parse(moment.at) <= RECENT_MS)) continue; // only fresh moments (never a backlog the first time)
    const rows = report.rows.filter((r) => r.moment.key === moment.key && r.outcome === "delivered" && r.alert && !r.alert.draft);
    if (!rows.length) continue;
    const { error: taken } = await db().from("push_reminders_sent").insert({ key: `hl:${moment.key}`.slice(0, 200) });
    if (taken) continue;
    const alert = rows[0].alert!;
    const result = await sendPush({ to: rows.map((r) => r.recipient), kind: "highlight", values: { "Trip ID": tripId }, groupId: tripId, words: { title: alert.title, body: alert.body } });
    if (result.status === "ok") sent += result.sent;
  }
  return sent;
}

/** After a trip score saves (with the round's scoring the save returned). */
/** profileId: the golfer who saved (team highlights load the trip's other rounds as them). */
export function pushHighlights(tripId: string, scoring: TripRoundScoring | null | undefined, profileId: string | null = null) {
  if (!scoring) return;
  void sendHighlights(tripId, scoring, profileId).catch(() => undefined);
}
