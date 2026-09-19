import { redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getAllPlayerRows } from "@/lib/portal/allPlayers";
import { GlobalPlayersAdmin, type GlobalPlayerRow } from "@/components/portal/tiger/GlobalPlayersAdmin";

export default async function GlobalPlayersPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");

  const service = createSupabaseServiceRoleClient();
  const allPlayers = await getAllPlayerRows();

  // Players claimed the old way (self-signed-up via a copied invite link,
  // before player_slots.email existed) have no email on file there —
  // fall back to their real account email so Tiger sees something instead
  // of "No email on file" for players who obviously do have one.
  const claimedByIds = allPlayers.map((p) => p.claimedBy).filter((id): id is string => Boolean(id));
  const { data: claimedProfiles } = claimedByIds.length
    ? await service.from("profiles").select("id, email").in("id", claimedByIds)
    : { data: [] };
  const accountEmailById = new Map((claimedProfiles ?? []).map((p) => [p.id, p.email as string]));

  const { data: pendingRows } = await service
    .from("player_profile_edits")
    .select("player_slug, field, proposed_value, submitted_at");
  const pendingBySlug = new Map<string, { field: string; proposedValue: string | string[]; submittedAt: string }[]>();
  for (const row of pendingRows ?? []) {
    const list = pendingBySlug.get(row.player_slug) ?? [];
    list.push({ field: row.field, proposedValue: row.proposed_value, submittedAt: row.submitted_at });
    pendingBySlug.set(row.player_slug, list);
  }

  const rows: GlobalPlayerRow[] = allPlayers.map((p) => ({
    playerSlug: p.playerSlug,
    fullName: p.fullName,
    username: p.username,
    claimedBy: p.claimedBy,
    email: p.email ?? (p.claimedBy ? accountEmailById.get(p.claimedBy) ?? null : null),
    pendingEdits: pendingBySlug.get(p.playerSlug) ?? [],
  }));

  return <GlobalPlayersAdmin rows={rows} />;
}
