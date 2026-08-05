import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPlayerTeam } from "@/lib/portal/findPlayerTeam";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ session: null });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name, is_host, player_slug")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ session: null });
  }

  if (profile.is_host) {
    return NextResponse.json({
      session: { kind: "host", username: profile.username, displayName: profile.display_name },
    });
  }

  if (profile.player_slug) {
    return NextResponse.json({
      session: {
        kind: "player",
        playerSlug: profile.player_slug,
        username: profile.username,
        displayName: profile.display_name,
        team: findPlayerTeam(profile.player_slug),
      },
    });
  }

  return NextResponse.json({
    session: { kind: "fan", username: profile.username, displayName: profile.display_name },
  });
}
