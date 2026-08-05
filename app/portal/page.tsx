import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { findPlayerTeam } from "@/lib/portal/findPlayerTeam";
import { Avatar } from "@/components/ui/Avatar";
import { TigerAvatar } from "@/components/ui/TigerAvatar";

export default async function PortalPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_host, player_slug, display_name, username")
    .eq("id", user.id)
    .single();

  if (!profile || (!profile.is_host && !profile.player_slug)) redirect("/");

  if (profile.is_host) {
    return (
      <div className="mx-auto flex max-w-[480px] flex-col items-center gap-4 px-4 py-16 text-center sm:px-7">
        <TigerAvatar size="lg" />
        <h1 className="font-serif text-2xl font-bold text-ink-900">Welcome, Tiger</h1>
        <p className="font-sans text-sm text-ink-500">Host tools are coming in a later round.</p>
      </div>
    );
  }

  const playerProfile = getPlayerProfileBySlug(profile.player_slug!);
  const team = findPlayerTeam(profile.player_slug!);

  return (
    <div className="mx-auto flex max-w-[480px] flex-col items-center gap-4 px-4 py-16 text-center sm:px-7">
      <Avatar name={playerProfile?.fullName ?? profile.display_name} src={playerProfile?.avatarSrc ?? null} size="lg" team={team} />
      <h1 className="font-serif text-2xl font-bold text-ink-900">Welcome, {playerProfile?.fullName ?? profile.display_name}</h1>
      <p className="font-sans text-sm text-ink-500">
        {team ? `Team ${team === "maroon" ? "Maroon" : "White"}` : "Team not yet assigned"} · @{profile.username}
      </p>
      <p className="font-sans text-sm text-ink-500">Scoring and pairings are coming in a later round.</p>
    </div>
  );
}
