import { NextResponse } from "next/server";
import { getGolfTrip } from "@/lib/platform/golfTripsServer";
import { loadSavedTripSetup } from "@/lib/platform/savedTripSetupServer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { draftBoardFor, draftCaptainsFor, draftPickError, draftSetupFrom, draftTeamsAsSetup, savedDraftFromJson, type DraftMember, type TeamDraftResponse } from "@/lib/platform/teamDraftPicks";

/**
 * The saved Team Draft (project_specs.md "Team Draft: picks are saved and final").
 *   GET                                   the draft for any trip member
 *   POST { action: "start" }              the organizer opens it
 *   POST { action: "pick", player, pickNumber }   the captain on the clock (or the organizer) drafts a player
 * Whose turn it is comes from lib/platform/teamDraftPicks.ts; supabase/golf_trip_team_draft.sql checks again. The last
 * pick saves the teams into the trip setup. Picks are never changed or removed.
 */
type Loaded = { error: NextResponse } | { tripId: string; viewer: TeamDraftResponse["viewer"]; members: DraftMember[]; setup: ReturnType<typeof draftSetupFrom>; draft: NonNullable<ReturnType<typeof savedDraftFromJson>> };
const missing = (code?: string) => code === "PGRST202" || code === "42883" || code === "42P01";
const fail = (message: string, status: number) => ({ error: NextResponse.json({ error: message }, { status }) });

async function load(tripId: string): Promise<Loaded> {
  const view = await getGolfTrip(tripId);
  if (view.status !== "ok") return fail("Trip not found.", view.status === "signed-out" ? 401 : 404);
  const snapshot = await loadSavedTripSetup(view.trip);
  const setup = draftSetupFrom(snapshot.values);
  if (!setup.isDraft) return fail("This trip's teams aren't picked by draft.", 400);
  // Draftable players: accepted members with an account, in the trip's member order (the order Settings uses).
  const members = view.trip.members.filter(member => member.invitationStatus === "accepted" && member.profileId)
    .map(member => ({ profileId: member.profileId!, name: member.displayName, avatarUrl: member.avatarUrl ?? null, username: member.username ?? null }));
  const { data, error } = await createSupabaseServiceRoleClient().rpc("get_golf_trip_team_draft", { p_profile: view.viewer.profileId, p_trip: tripId });
  if (error) return fail(missing(error.code) ? "Team draft storage is not installed yet." : "Couldn't load the draft.", missing(error.code) ? 503 : 500);
  const draft = savedDraftFromJson(data);
  if (!draft) return fail("Trip not found.", 404);
  const teamCount = draftBoardFor(members, setup.captains, setup.settings, draft.picks).teamCount;
  const captainOf = draftCaptainsFor(setup.captains, members, teamCount).indexOf(view.viewer.profileId);
  return { tripId, members, setup, draft, viewer: { profileId: view.viewer.profileId, isOrganizer: view.viewer.isOrganizer, captainOf: captainOf < 0 ? null : captainOf } };
}

function answer(loaded: Exclude<Loaded, { error: NextResponse }>, draft = loaded.draft): NextResponse {
  const board = draftBoardFor(loaded.members, loaded.setup.captains, loaded.setup.settings, draft.picks);
  const body: TeamDraftResponse = { members: loaded.members, captains: draftCaptainsFor(loaded.setup.captains, loaded.members, board.teamCount),
    settings: loaded.setup.settings, draft, viewer: loaded.viewer };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const loaded = await load((await params).tripId);
  return "error" in loaded ? loaded.error : answer(loaded);
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const loaded = await load((await params).tripId);
  if ("error" in loaded) return loaded.error;
  let body: { action?: unknown; player?: unknown; pickNumber?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const db = createSupabaseServiceRoleClient();
  const refused = (error: { code?: string; message: string }) => NextResponse.json({ error: ["40001", "42501", "22023"].includes(error.code ?? "") ? error.message : "Couldn't save the pick." },
    { status: error.code === "40001" ? 409 : error.code === "42501" ? 403 : error.code === "22023" ? 400 : missing(error.code) ? 503 : 500 });

  if (body.action === "start") {
    if (!loaded.viewer.isOrganizer) return NextResponse.json({ error: "Only the organizer can start the draft." }, { status: 403 });
    if (loaded.setup.settings.method !== "Captain's Picks") return NextResponse.json({ error: "This draft type doesn't use picks." }, { status: 400 });
    // Everyone on a team, every team the same size: the wrong number of players can't be drafted.
    const countError = draftBoardFor(loaded.members, loaded.setup.captains, loaded.setup.settings, loaded.draft.picks).countError;
    if (countError) return NextResponse.json({ error: countError }, { status: 400 });
    const { data, error } = await db.rpc("start_golf_trip_team_draft", { p_profile: loaded.viewer.profileId, p_trip: loaded.tripId });
    return error ? refused(error) : answer(loaded, savedDraftFromJson(data) ?? loaded.draft);
  }

  if (body.action !== "pick" || typeof body.player !== "string" || !Number.isInteger(body.pickNumber)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const board = draftBoardFor(loaded.members, loaded.setup.captains, loaded.setup.settings, loaded.draft.picks);
  const problem = draftPickError(board, loaded.setup.captains, loaded.members, {
    viewer: loaded.viewer.profileId, isOrganizer: loaded.viewer.isOrganizer, started: !!loaded.draft.startedAt, completed: !!loaded.draft.completedAt,
    settings: loaded.setup.settings, player: body.player, pickNumber: body.pickNumber as number, picksSoFar: loaded.draft.picks.length,
  });
  if (problem) return NextResponse.json({ error: problem }, { status: problem === "That pick was already made." ? 409 : problem === "It's not your pick." ? 403 : 400 });
  const { data, error } = await db.rpc("make_golf_trip_team_draft_pick", { p_profile: loaded.viewer.profileId, p_trip: loaded.tripId, p_pick_number: body.pickNumber,
    p_player: body.player, p_team: board.turn, p_team_count: board.teamCount });
  if (error) return refused(error);
  let draft = savedDraftFromJson(data) ?? loaded.draft;
  // That was the last pick: save the teams as the trip's teams and close the draft.
  const after = draftBoardFor(loaded.members, loaded.setup.captains, loaded.setup.settings, draft.picks);
  if (after.done) {
    const finished = await db.rpc("complete_golf_trip_team_draft", { p_profile: loaded.viewer.profileId, p_trip: loaded.tripId, p_teams: draftTeamsAsSetup(after, loaded.members) });
    if (!finished.error) draft = savedDraftFromJson(finished.data) ?? draft;
  }
  return answer(loaded, draft);
}
