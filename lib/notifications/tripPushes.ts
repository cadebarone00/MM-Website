import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { golfTripInvitePath } from "@/lib/platform/golfTripInvitations";
import { sendPush } from "./pushServer.ts";

/**
 * Golf Trip phone notifications (project_specs.md "Expo app Step 6", part 6b): each one is sent right after its change
 * saved on the server, fired without waiting (a failure never changes what the person sees), and only to the people
 * the master list says (lib/notifications/catalog.ts). Nothing goes out before supabase/push_devices.sql is run.
 */
const db = () => createSupabaseServiceRoleClient();
const quietly = (task: () => Promise<unknown>) => { void task().catch(() => undefined); };

async function names(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data } = await db().from("profiles").select("id, display_name").in("id", ids);
  return new Map(((data ?? []) as { id: string; display_name: string | null }[]).map((p) => [p.id, p.display_name?.trim() || "A golfer"]));
}
async function tripName(tripId: string): Promise<string> {
  const { data } = await db().from("golf_trips").select("name").eq("id", tripId).maybeSingle();
  return (data as { name?: string } | null)?.name ?? "your trip";
}

/** Trip invite: someone invited by an email that belongs to a Maroon account gets it, opening the invite (Accept / Decline). */
export function pushTripInvite(tripId: string, organizerId: string, email: string | null | undefined, inviteToken: string) {
  const address = email?.trim().toLowerCase();
  if (!address) return;
  quietly(async () => {
    const { data } = await db().from("profiles").select("id").ilike("email", address.replace(/[\\%_]/g, (c) => `\\${c}`)).limit(1).maybeSingle();
    const invitee = (data as { id?: string } | null)?.id;
    if (!invitee || invitee === organizerId) return;
    const [who, trip] = await Promise.all([names([organizerId]), tripName(tripId)]);
    await sendPush({ to: [invitee], kind: "invited", values: { Player: who.get(organizerId) ?? "Someone", Trip: trip, "Trip ID": tripId }, groupId: tripId, link: golfTripInvitePath(inviteToken) });
  });
}

/** Team Draft: the captain now on the clock (not when they're the one who just picked, e.g. a snake turn). */
export function pushYourPick(tripId: string, captainId: string | null, actorId: string) {
  if (!captainId || captainId === actorId) return;
  quietly(async () => sendPush({ to: [captainId], kind: "yourPick", values: { Trip: await tripName(tripId), "Trip ID": tripId }, groupId: tripId }));
}

type GroupRow = { id: string; golf_trip_id: string | null; golf_trip_round_id: string | null };
type PlayerRow = { group_id: string; profile_id: string; attester_profile_id: string | null; submitted_at: string | null };

async function roundOf(groupId: string) {
  const { data: group } = await db().from("scoring_groups").select("id, golf_trip_id, golf_trip_round_id").eq("id", groupId).maybeSingle();
  const g = group as GroupRow | null;
  if (!g?.golf_trip_id || !g.golf_trip_round_id) return null;
  const { data: round } = await db().from("golf_trip_rounds").select("round_number, course_name").eq("id", g.golf_trip_round_id).maybeSingle();
  const r = round as { round_number: number; course_name: string | null } | null;
  return r ? { tripId: g.golf_trip_id, roundId: g.golf_trip_round_id, number: r.round_number, course: r.course_name ?? "the course" } : null;
}

/**
 * A golfer submitted their card: everyone in their group who hasn't submitted yet hears "{Player} submitted Round N";
 * if that was the last card of the round, everyone on the trip hears "Round N is final".
 */
export function pushCardSubmitted(groupId: string, golferId: string) {
  quietly(async () => {
    const round = await roundOf(groupId);
    if (!round) return;
    const { data: groups } = await db().from("scoring_groups").select("id").eq("golf_trip_round_id", round.roundId);
    const groupIds = ((groups ?? []) as { id: string }[]).map((g) => g.id);
    const { data: players } = await db().from("scoring_group_players").select("group_id, profile_id, attester_profile_id, submitted_at").in("group_id", groupIds);
    const all = (players ?? []) as PlayerRow[];
    const who = await names([golferId]);
    const base = { Player: who.get(golferId) ?? "A golfer", Round: round.number, Course: round.course, "Trip ID": round.tripId };
    const waiting = all.filter((p) => p.group_id === groupId && p.profile_id !== golferId && !p.submitted_at).map((p) => p.profile_id);
    if (waiting.length) await sendPush({ to: waiting, kind: "opponentSubmitted", values: base, groupId: round.tripId });
    if (all.length && all.every((p) => p.submitted_at)) {
      const { data: members } = await db().from("golf_trip_members").select("profile_id").eq("golf_trip_id", round.tripId).eq("invitation_status", "accepted");
      const everyone = ((members ?? []) as { profile_id: string | null }[]).flatMap((m) => (m.profile_id ? [m.profile_id] : []));
      await sendPush({ to: everyone, kind: "roundFinal", values: base, groupId: round.tripId });
    }
  });
}

/** A card was refused because it doesn't match the attester's: the attester hears which hole to look at (the golfer
 *  already sees it on their own screen, and a retry doesn't buzz them again). */
export function pushCardMismatch(groupId: string, golferId: string, holes: number[]) {
  if (!holes.length) return;
  quietly(async () => {
    const round = await roundOf(groupId);
    if (!round) return;
    const { data } = await db().from("scoring_group_players").select("attester_profile_id").eq("group_id", groupId).eq("profile_id", golferId).maybeSingle();
    const attester = (data as { attester_profile_id?: string | null } | null)?.attester_profile_id;
    if (!attester) return;
    const who = await names([golferId, attester]);
    const hole = Math.min(...holes);
    const values = (other: string) => ({ Hole: hole, Player: who.get(other) ?? "Your partner", Round: round.number, "Trip ID": round.tripId });
    await sendPush({ to: [attester], kind: "cardMismatch", values: values(golferId), groupId: round.tripId });
  });
}
