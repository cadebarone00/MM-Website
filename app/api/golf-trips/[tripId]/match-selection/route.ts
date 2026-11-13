import { NextResponse } from "next/server";
import { getGolfTrip } from "@/lib/platform/golfTripsServer";
import { loadSavedTripSetup } from "@/lib/platform/savedTripSetupServer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { matchDraftRounds } from "@/lib/platform/matchDraft";
import { applySelection, catchUpSelection, selectionResponse, selectionResults, selectionStateFromJson, type SelectionAction, type SelectionMember, type SelectionState } from "@/lib/platform/matchSelection";
import { resultsAsPositions, selectionRoundFrom, selectionTeamsFrom } from "@/lib/platform/matchSelectionSetup";

/**
 * Saved Match Selection (project_specs.md "Match Selection: rebuilt room, captains, saved and final").
 *   GET  ?round=1-0                         the round as this person may see it
 *   POST { round, action, ... }             start / place / remove / submit / lock / randomize
 * The rules are lib/platform/matchSelection.ts; expired timers are caught up on every request; the database
 * (supabase/golf_trip_match_selection.sql) stores the result with a version check. Final once complete.
 */
const missing = (code?: string) => code === "PGRST202" || code === "42883" || code === "42P01";
const fail = (error: string, status: number) => ({ response: NextResponse.json({ error }, { status }) });

async function load(tripId: string, roundKey: unknown) {
  if (typeof roundKey !== "string" || !/^[0-9]{1,2}-[0-9]$/.test(roundKey)) return fail("Pick a round.", 400);
  const view = await getGolfTrip(tripId);
  if (view.status !== "ok") return fail("Trip not found.", view.status === "signed-out" ? 401 : 404);
  const snapshot = await loadSavedTripSetup(view.trip);
  const accepted = view.trip.members.filter(member => member.invitationStatus === "accepted" && member.profileId);
  const memberIds = accepted.map(member => member.profileId!);
  const draftRound = matchDraftRounds(snapshot.values, snapshot.basis.rounds.map(round => ({ number: round.roundNumber, date: round.playDate ?? "", course: round.courseName ?? "" })), memberIds.length)
    .find(round => round.key === roundKey);
  const round = draftRound && selectionRoundFrom(draftRound);
  if (!round) return fail("This round isn't set up for match selection.", 404);
  const teams = selectionTeamsFrom(snapshot.values, memberIds);
  if (!teams) return fail("Set the teams first (finish the team draft).", 400);
  const { data, error } = await createSupabaseServiceRoleClient().rpc("get_golf_trip_match_selection", { p_profile: view.viewer.profileId, p_trip: tripId, p_round: roundKey });
  if (error) return fail(missing(error.code) ? "Match selection storage is not installed yet." : "Couldn't load match selection.", missing(error.code) ? 503 : 500);
  if (!data) return fail("Trip not found.", 404);
  const saved = data as { version: number; state: unknown };
  const me = view.viewer.profileId;
  const team = teams.rosters[0].includes(me) ? 0 : teams.rosters[1].includes(me) ? 1 : null;
  const captainOf = teams.captains[0] === me ? 0 : teams.captains[1] === me ? 1 : null;
  const members: SelectionMember[] = accepted.map(member => ({ profileId: member.profileId!, name: member.displayName, avatarUrl: member.avatarUrl ?? null, username: member.username ?? null }));
  return { tripId, round, memberIds, members, ...teams, version: saved.version, state: selectionStateFromJson(saved.state), viewer: { profileId: me, isOrganizer: view.viewer.isOrganizer, team, captainOf } as const };
}
type Loaded = Exclude<Awaited<ReturnType<typeof load>>, { response: NextResponse }>;

/** Save a changed state (and the finished matches when it just completed). Returns an error response or null. */
async function save(loaded: Loaded, state: SelectionState): Promise<NextResponse | null> {
  const results = state.completedAt ? resultsAsPositions(selectionResults(loaded.round, state), loaded.memberIds) : null;
  const { error } = await createSupabaseServiceRoleClient().rpc("save_golf_trip_match_selection", { p_profile: loaded.viewer.profileId, p_trip: loaded.tripId, p_round: loaded.round.key,
    p_version: loaded.version, p_type: loaded.round.type, p_state: state, p_results: results });
  if (!error) return null;
  return NextResponse.json({ error: ["40001", "42501", "22023"].includes(error.code ?? "") ? error.message : "Couldn't save match selection." },
    { status: error.code === "40001" ? 409 : error.code === "42501" ? 403 : error.code === "22023" ? 400 : missing(error.code) ? 503 : 500 });
}
const answer = (loaded: Loaded, state: SelectionState | null, now: number) => NextResponse.json(selectionResponse({ round: loaded.round, members: loaded.members, rosters: loaded.rosters,
  captains: loaded.captains, teamNames: loaded.teamNames, state, viewer: loaded.viewer, now }), { headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const loaded = await load((await params).tripId, new URL(request.url).searchParams.get("round"));
  if ("response" in loaded) return loaded.response;
  const now = Date.now();
  let state = loaded.state;
  if (state) {
    const caught = catchUpSelection(loaded.round, loaded.rosters, state, now);
    if (caught.state !== state) {
      const problem = await save(loaded, caught.state);
      if (problem && problem.status !== 409) return problem; // someone else saved the same catch-up first: fine
      state = caught.state;
    }
  }
  return answer(loaded, state, now);
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const loaded = await load((await params).tripId, body.round);
  if ("response" in loaded) return loaded.response;
  if (!["start", "place", "remove", "submit", "lock", "randomize"].includes(String(body.action))) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const now = Date.now();
  const caught = loaded.state ? catchUpSelection(loaded.round, loaded.rosters, loaded.state, now).state : null;
  const result = applySelection(loaded.round, loaded.rosters, caught, loaded.viewer, body as unknown as SelectionAction, now);
  if (result.error) return NextResponse.json({ error: result.error }, { status: /Only |turn|captain/.test(result.error) ? 403 : 400 });
  const problem = await save(loaded, result.state!);
  return problem ?? answer(loaded, result.state, now);
}
