import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { activeConfigFromJson } from "@/lib/highlights/configRows";
import { detectionSetup } from "@/lib/highlights/detect/roundPars";
import { runShadow } from "@/lib/highlights/detect/shadow";
import { competitionProfile, type CompetitionSetup } from "@/lib/highlights/engine/competition";
import type { TripRoundScoring } from "@/lib/platform/tripScoring";
import { sendPush } from "./pushServer.ts";

/**
 * The Highlights engine, LIVE (project_specs.md "Expo app Step 6", part 6e; owner decision 2026-11-27: switch now, no
 * practice run). After a trip score saves, the engine looks at the whole round with the PUBLISHED sheet (Admin Center →
 * Highlights): the detectors find the moments (birdie streaks from 3, eagles, albatrosses, hole in one), the engine
 * decides per trip member who hears each one and in which approved words (the same decision the simulator shows:
 * competition, audience, categories, intensity, approval, placeholders, volume limit). Each moment goes out once
 * (push_reminders_sent "hl:<key>"), only moments from the last 20 minutes, and Settings → Notifications → Big moments can
 * turn them off. Nothing is published = nothing sent. Never waits; a failure never touches the score that was saved.
 */
const db = () => createSupabaseServiceRoleClient();
const RECENT_MS = 20 * 60_000;

async function sendHighlights(tripId: string, scoring: TripRoundScoring): Promise<number> {
  const active = activeConfigFromJson((await db().rpc("get_active_highlight_config", {})).data);
  if (!active) return 0;
  const [{ data: setupRow }, { data: memberRows }] = await Promise.all([
    db().from("golf_trip_setup").select("settings").eq("golf_trip_id", tripId).maybeSingle(),
    db().from("golf_trip_members").select("profile_id, display_name, role, invitation_status").eq("golf_trip_id", tripId).order("created_at"),
  ]);
  const comp = ((setupRow as { settings?: { localCompetitionType?: { individual?: unknown; team?: unknown } } } | null)?.settings?.localCompetitionType) ?? {};
  const setup: CompetitionSetup = {
    individual: comp.individual === "Stroke Play" || comp.individual === "Points Based" ? comp.individual : comp.individual ? "Stroke Play" : null,
    team: ["2 Teams", "Pairs", "3-Ball", "4-Ball"].includes(comp.team as string) ? comp.team as CompetitionSetup["team"] : null,
  };
  const members = ((memberRows ?? []) as { profile_id: string | null; display_name: string | null; role: string; invitation_status: string }[])
    .filter((m) => m.profile_id && (m.role === "organizer" || m.invitation_status === "accepted"))
    .map((m) => ({ id: m.profile_id as string, name: m.display_name?.trim() || "A golfer" }));
  if (!members.length) return 0;

  const { pars, startHoles } = detectionSetup(scoring);
  const report = runShadow({ detection: { tripId, scoring, pars, course: null, startHoles }, config: active.config, configVersion: active.version, competition: competitionProfile(setup), members });
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
export function pushHighlights(tripId: string, scoring: TripRoundScoring | null | undefined) {
  if (!scoring) return;
  void sendHighlights(tripId, scoring).catch(() => undefined);
}
