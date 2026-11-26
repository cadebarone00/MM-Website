import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { validSetup } from "@/lib/platform/savedTripSetup";
import { DEFAULT_TRIP_TIME_ZONE, dueDraft, dueTeeTimes, isTimeZone, localNow } from "./reminders.ts";
import { sendPush } from "./pushServer.ts";

/**
 * The 5-minute timer's work (project_specs.md "Expo app Step 6", part 6c): for every trip that isn't over, what's due
 * now (lib/notifications/reminders.ts), each reminder claimed once in push_reminders_sent, then sent. Before
 * supabase/push_reminders.sql is run it answers "not_installed" and sends nothing.
 */
const db = () => createSupabaseServiceRoleClient();
const MISSING = new Set(["42P01", "PGRST205", "42703", "PGRST204"]);
export type ReminderRun = { status: "ok"; trips: number; sent: number } | { status: "not_installed" } | { status: "failed" };

type TripRow = { id: string; name: string; time_zone: string | null };
type SetupRow = { golf_trip_id: string; settings: unknown; basis: { startDate?: string; rounds?: unknown[] } | null };
type MemberRow = { golf_trip_id: string; profile_id: string | null; invitation_status: string; role: string };

/** True only for the first caller: the reminder isn't in the sent list yet. */
async function claim(key: string): Promise<boolean> {
  const { error } = await db().from("push_reminders_sent").insert({ key });
  return !error;
}

export async function runReminders(now = new Date()): Promise<ReminderRun> {
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const trips = await db().from("golf_trips").select("id, name, time_zone").gte("end_date", yesterday).limit(500);
  if (trips.error) return MISSING.has(trips.error.code ?? "") ? { status: "not_installed" } : { status: "failed" };
  const rows = (trips.data ?? []) as TripRow[];
  if (!rows.length) return { status: "ok", trips: 0, sent: 0 };
  const ids = rows.map((t) => t.id);
  const [setups, members] = await Promise.all([
    db().from("golf_trip_setup").select("golf_trip_id, settings, basis").in("golf_trip_id", ids),
    db().from("golf_trip_members").select("golf_trip_id, profile_id, invitation_status, role").in("golf_trip_id", ids).order("created_at"),
  ]);
  if (setups.error || members.error) return { status: "failed" };
  const setupOf = new Map(((setups.data ?? []) as SetupRow[]).map((s) => [s.golf_trip_id, s]));
  const memberRows = (members.data ?? []) as MemberRow[];

  let sent = 0;
  for (const trip of rows) {
    const setup = setupOf.get(trip.id);
    if (!setup || !validSetup(setup.settings) || !setup.basis?.startDate || !Array.isArray(setup.basis.rounds)) continue;
    const values = setup.settings as Record<string, unknown>;
    const nowLocal = localNow(isTimeZone(trip.time_zone) ? trip.time_zone : DEFAULT_TRIP_TIME_ZONE, now);
    const tripMembers = memberRows.filter((m) => m.golf_trip_id === trip.id);
    // Player numbers in the setup are places in this list (join order); only joined people get notifications.
    const placeIds = tripMembers.map((m) => (m.role === "organizer" || m.invitation_status === "accepted" ? m.profile_id : null));
    const everyone = placeIds.filter((id): id is string => !!id);

    for (const tee of dueTeeTimes(trip.id, values, setup.basis as never, placeIds, nowLocal)) {
      if (!await claim(tee.key)) continue;
      const result = await sendPush({ to: tee.players, kind: "teeTime", values: { Round: tee.round, Course: tee.course, Time: tee.time, Trip: trip.name, "Trip ID": trip.id }, groupId: trip.id });
      if (result.status === "ok") sent += result.sent;
    }
    const draft = dueDraft(trip.id, values, nowLocal);
    if (draft && everyone.length && await claim(draft.key)) {
      const result = await sendPush({ to: everyone, kind: "draftStarting", values: { Trip: trip.name, Time: draft.time, "Trip ID": trip.id }, groupId: trip.id });
      if (result.status === "ok") sent += result.sent;
    }
  }
  await db().from("push_reminders_sent").delete().lt("sent_at", new Date(now.getTime() - 30 * 86_400_000).toISOString());
  return { status: "ok", trips: rows.length, sent };
}
