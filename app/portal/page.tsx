import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { findPlayerTeam } from "@/lib/portal/findPlayerTeam";
import { Avatar } from "@/components/ui/Avatar";
import { PlayerScoringPanel } from "@/components/portal/PlayerScoringPanel";

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

  // Tiger doesn't get a fork screen or Website access — straight to the
  // Tiger Center on login, per the site plan (docs/superpowers/specs/
  // 2026-08-28-site-plan-design.md).
  if (profile.is_host) redirect("/portal/admin");

  const playerProfile = getPlayerProfileBySlug(profile.player_slug!);
  const team = findPlayerTeam(profile.player_slug!);

  return (
    <div className="mx-auto flex max-w-[640px] flex-col items-center gap-4 px-4 py-16 text-center sm:px-7">
      <Avatar name={playerProfile?.fullName ?? profile.display_name} src={playerProfile?.avatarSrc ?? null} size="lg" team={team} />
      <h1 className="font-serif text-2xl font-bold text-ink-900">Welcome, {playerProfile?.fullName ?? profile.display_name}</h1>
      <p className="font-sans text-sm text-ink-500">
        {team ? `Team ${team === "maroon" ? "Maroon" : "White"}` : "Team not yet assigned"} · @{profile.username}
      </p>
      <div className="w-full max-w-[640px] text-left">
        <PlayerScoringPanel />
      </div>
      <Link href="/portal/profile" className="font-sans text-sm font-semibold text-maroon-700 hover:underline">
        Edit My Bio →
      </Link>
    </div>
  );
}
