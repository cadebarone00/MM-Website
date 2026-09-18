import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import { playerProfiles } from "@/lib/data/players";
import { PlayerSlotsAdmin, type PlayerSlotAdminRow } from "@/components/portal/PlayerSlotsAdmin";

export default async function PortalAdminPage({ params }: { params: Promise<{ year: string }> }) {
  const { year: yearParam } = await params;
  const year = Number(yearParam);
  if (!isValidSeasonYear(year)) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");

  const service = createSupabaseServiceRoleClient();
  const { data: slots } = await service.from("player_slots").select("player_slug, username, claimed_by, email");
  const byslug = new Map((slots ?? []).map((s) => [s.player_slug, s]));

  // Players claimed the old way (self-signed-up via a copied invite link,
  // before player_slots.email existed) have no email on file there — fall
  // back to their real account email so Tiger sees something instead of
  // "No email on file" for players who obviously do have one.
  const claimedByIds = (slots ?? []).map((s) => s.claimed_by).filter((id): id is string => Boolean(id));
  const { data: claimedProfiles } = claimedByIds.length
    ? await service.from("profiles").select("id, email").in("id", claimedByIds)
    : { data: [] };
  const accountEmailById = new Map((claimedProfiles ?? []).map((p) => [p.id, p.email as string]));

  const [{ data: roster }, { data: locks }] = await Promise.all([
    service.from("live_roster").select("player_slug, team").eq("season_year", year),
    service.from("live_roster_assignment_locks").select("player_slug").eq("season_year", year),
  ]);
  const rosterBySlug = new Map((roster ?? []).map((r) => [r.player_slug, r.team as "maroon" | "white"]));
  const lockedSlugs = new Set((locks ?? []).map((lock) => lock.player_slug));

  const { data: pendingRows } = await service
    .from("player_profile_edits")
    .select("player_slug, field, proposed_value, submitted_at");
  const pendingBySlug = new Map<string, { field: string; proposedValue: string | string[]; submittedAt: string }[]>();
  for (const row of pendingRows ?? []) {
    const list = pendingBySlug.get(row.player_slug) ?? [];
    list.push({ field: row.field, proposedValue: row.proposed_value, submittedAt: row.submitted_at });
    pendingBySlug.set(row.player_slug, list);
  }

  const rows: PlayerSlotAdminRow[] = playerProfiles.map((p) => {
    const slot = byslug.get(p.slug);
    return {
      playerSlug: p.slug,
      fullName: p.fullName,
      username: slot?.username ?? null,
      claimedBy: slot?.claimed_by ?? null,
      // A saved player_slots.email always wins (it's the one "Edit email"
      // writes to, so an edit is guaranteed to show up); otherwise fall back
      // to the real account email once claimed.
      email: slot?.email ?? (slot?.claimed_by ? accountEmailById.get(slot.claimed_by) ?? null : null),
      team: rosterBySlug.get(p.slug) ?? null,
      teamLocked: lockedSlugs.has(p.slug),
      pendingEdits: pendingBySlug.get(p.slug) ?? [],
    };
  });

  return <PlayerSlotsAdmin year={year} rows={rows} />;
}
