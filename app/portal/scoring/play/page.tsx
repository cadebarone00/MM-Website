// app/portal/scoring/play/page.tsx
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlayerNameMap } from "@/lib/portal/allPlayers";
import { findCurrentSessionForPlayer } from "@/lib/live/currentRoundForPlayer";
import { ScoringPanel } from "@/components/portal/ScoringPanel";

export default async function ScoringPlayPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_host, player_slug").eq("id", user.id).single();
  if (!profile || (!profile.is_host && !profile.player_slug)) redirect("/");
  if (profile.is_host) redirect("/portal/admin");

  const playerSlug = profile.player_slug!;
  const result = await findCurrentSessionForPlayer(playerSlug);
  if (!result || result.state !== "Live") redirect("/portal/scoring");

  const nameBySlug = await getPlayerNameMap();

  return (
    <div className="mx-auto max-w-[720px] px-4 sm:px-7">
      <ScoringPanel
        playerSlug={playerSlug}
        playerFullName={nameBySlug[playerSlug] ?? playerSlug}
        round={result.session.session}
        matchBox={{
          id: result.matchBox.id!,
          format: result.matchBox.format,
          maroonPlayers: result.matchBox.maroonPlayers,
          whitePlayers: result.matchBox.whitePlayers,
        }}
        nameBySlug={nameBySlug}
      />
    </div>
  );
}
