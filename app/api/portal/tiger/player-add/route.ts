import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { playerProfiles } from "@/lib/data/players";
import { computePlayerSlug } from "@/lib/portal/computePlayerSlug";
import { computePlayerUsername } from "@/lib/portal/computePlayerUsername";

// Creates a brand-new player who exists purely as a player_slots row — no
// lib/data/players/*.ts file, no code change, no deploy. Everything else
// (invite, bio, team assignment) is the existing per-player tooling
// already built for the 13 hand-written players.
export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { fullName, email } = await request.json();
  if (typeof fullName !== "string" || !fullName.trim() || typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ ok: false, error: "Missing name or email." }, { status: 400 });
  }
  const trimmedName = fullName.trim();

  const service = createSupabaseServiceRoleClient();
  const { data: existingSlots } = await service.from("player_slots").select("player_slug");
  const takenSlugs = new Set([
    ...playerProfiles.map((p) => p.slug),
    ...(existingSlots ?? []).map((s) => s.player_slug),
  ]);

  const baseSlug = computePlayerSlug(trimmedName);
  // computePlayerSlug returns "" for a name with no ASCII letters/digits.
  // A slug is permanent and never editable, so reject rather than insert
  // an empty (falsy) identifier.
  if (!baseSlug) {
    return NextResponse.json(
      { ok: false, error: "Name must include at least one letter or number." },
      { status: 400 }
    );
  }
  let slug = baseSlug;
  let suffix = 2;
  while (takenSlugs.has(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  const username = computePlayerUsername(trimmedName);
  const { error } = await service.from("player_slots").insert({
    player_slug: slug,
    username,
    full_name: trimmedName,
    email: email.trim(),
    claimed_by: null,
  });
  if (error) {
    return NextResponse.json(
      { ok: false, error: "That name's username is already taken — try a slightly different spelling." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, playerSlug: slug });
}
