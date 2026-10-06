import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { findUnclaimedSlotForUsername } from "@/lib/portal/matchPlayerUsername";

export async function POST(request: Request) {
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid signup request." }, { status: 400 });
  }
  if (!body || typeof body.email !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ ok: false, error: "Email and password are required." }, { status: 400 });
  }
  const email = body.email.trim();
  const password = body.password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Golfer";
  const username = typeof body.username === "string" && body.username.trim() ? body.username.trim() : `golfer_${crypto.randomUUID().replaceAll("-", "")}`;

  if (password.length < 6) {
    return NextResponse.json({ ok: false, error: "Password must be at least 6 characters." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const isReservedPrefix = username.toUpperCase().startsWith("MM");
  let matchedSlug: string | null = null;

  if (isReservedPrefix) {
    const { data: slots } = await service.from("player_slots").select("player_slug, username, claimed_by");
    const match = findUnclaimedSlotForUsername(username, slots ?? []);
    if (!match) {
      return NextResponse.json({ ok: false, error: "That username isn't available." }, { status: 400 });
    }
    matchedSlug = match.player_slug;
  }

  const supabase = await createSupabaseServerClient();
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError || !signUpData.user) {
    return NextResponse.json({ ok: false, error: signUpError?.message ?? "Could not create account." }, { status: 400 });
  }

  const { error: profileError } = await service.from("profiles").insert({
    id: signUpData.user.id,
    email,
    display_name: name,
    username,
    is_host: false,
    player_slug: matchedSlug,
  });

  if (profileError) {
    const { error: deleteError } = await service.auth.admin.deleteUser(signUpData.user.id);
    if (deleteError) {
      console.error("Failed to clean up orphaned auth user after profile insert failure:", deleteError);
    }
    return NextResponse.json({ ok: false, error: "That username or email is already taken." }, { status: 400 });
  }

  if (matchedSlug) {
    const { data: claimed } = await service
      .from("player_slots")
      .update({ claimed_by: signUpData.user.id, claimed_at: new Date().toISOString() })
      .eq("player_slug", matchedSlug)
      .is("claimed_by", null)
      .select();

    if (!claimed || claimed.length === 0) {
      // Someone else claimed this exact slot in the split second between our
      // check above and this update. Extremely unlikely now that usernames
      // are reserved/deterministic, but roll back cleanly rather than leave
      // an account wrongly marked as this player.
      const { error: clearSlugError } = await service.from("profiles").update({ player_slug: null }).eq("id", signUpData.user.id);
      if (clearSlugError) {
        console.error("Failed to clear player_slug during claim-race rollback:", clearSlugError);
      }
      const { error: deleteError } = await service.auth.admin.deleteUser(signUpData.user.id);
      if (deleteError) {
        console.error("Failed to clean up auth user after losing a player-slot claim race:", deleteError);
      }
      return NextResponse.json({ ok: false, error: "That username was just claimed — try again." }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}
