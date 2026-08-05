import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { findUnclaimedSlotForUsername } from "@/lib/portal/matchPlayerUsername";

export async function POST(request: Request) {
  const { name, email, username, password } = await request.json();

  if (!name || !email || !username || !password) {
    return NextResponse.json({ ok: false, error: "All fields are required." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const service = createSupabaseServiceRoleClient();

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError || !signUpData.user) {
    return NextResponse.json({ ok: false, error: signUpError?.message ?? "Could not create account." }, { status: 400 });
  }

  // profiles has no client-writable policy — every insert happens here,
  // server-side, with the service-role key.
  const { error: profileError } = await service.from("profiles").insert({
    id: signUpData.user.id,
    email,
    display_name: name,
    username,
    is_host: false,
    player_slug: null,
  });

  if (profileError) {
    // Most likely a duplicate username (profiles.username is unique).
    return NextResponse.json({ ok: false, error: "That username or email is already taken." }, { status: 400 });
  }

  const { data: slots } = await service.from("player_slots").select("player_slug, username, claimed_by");
  const match = findUnclaimedSlotForUsername(username, slots ?? []);

  if (match) {
    await service
      .from("player_slots")
      .update({ claimed_by: signUpData.user.id, claimed_at: new Date().toISOString() })
      .eq("player_slug", match.player_slug)
      .is("claimed_by", null); // guards against a same-instant double-claim race

    await service.from("profiles").update({ player_slug: match.player_slug }).eq("id", signUpData.user.id);
  }

  return NextResponse.json({ ok: true });
}
