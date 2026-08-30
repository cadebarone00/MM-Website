// app/portal/scoring/play/page.tsx
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug, playerProfiles } from "@/lib/data/players";
import { findCurrentRoundForPlayer } from "@/lib/live/currentRoundForPlayer";
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
  const result = await findCurrentRoundForPlayer(playerSlug);
  if (!result || result.state !== "Live") redirect("/portal/scoring");

  const nameBySlug = new Map(playerProfiles.map((p) => [p.slug, p.fullName]));

  return (
    <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-7">
      <ScoringPanel
        playerSlug={playerSlug}
        playerFullName={getPlayerProfileBySlug(playerSlug)?.fullName ?? playerSlug}
        round={result.round.round}
        matchBox={{
          id: result.matchBox.id!,
          format: result.matchBox.format,
          maroonPlayers: result.matchBox.maroonPlayers,
          whitePlayers: result.matchBox.whitePlayers,
        }}
        nameBySlug={Object.fromEntries(nameBySlug)}
      />
    </div>
  );
}
