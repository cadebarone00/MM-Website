import { redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { playerProfiles } from "@/lib/data/players";
import { PlayerSlotsAdmin, type PlayerSlotAdminRow } from "@/components/portal/PlayerSlotsAdmin";

export default async function PortalAdminPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");

  const service = createSupabaseServiceRoleClient();
  const { data: slots } = await service.from("player_slots").select("player_slug, username, claimed_by");
  const byslug = new Map((slots ?? []).map((s) => [s.player_slug, s]));

  const rows: PlayerSlotAdminRow[] = playerProfiles.map((p) => ({
    playerSlug: p.slug,
    fullName: p.fullName,
    username: byslug.get(p.slug)?.username ?? null,
    claimedBy: byslug.get(p.slug)?.claimed_by ?? null,
  }));

  return <PlayerSlotsAdmin rows={rows} />;
}
