// app/api/portal/profile/route.ts
import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { getProfileOverrides, isEditableField, mergeProfile } from "@/lib/data/players/overrides";

export async function GET() {
  const player = await requirePlayer();
  if (!player) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const baseProfile = getPlayerProfileBySlug(player.playerSlug);
  if (!baseProfile) {
    return NextResponse.json({ ok: false, error: "No profile found for this player." }, { status: 404 });
  }

  const overrides = await getProfileOverrides(player.playerSlug);
  const profile = mergeProfile(baseProfile, overrides);

  const service = createSupabaseServiceRoleClient();
  const { data: pending } = await service
    .from("player_profile_edits")
    .select("field, proposed_value, submitted_at")
    .eq("player_slug", player.playerSlug);

  return NextResponse.json(
    {
      ok: true,
      profile,
      pendingEdits: (pending ?? []).map((row) => ({
        field: row.field as string,
        proposedValue: row.proposed_value as string | string[],
        submittedAt: row.submitted_at as string,
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

interface EditInput {
  field: string;
  value: string | string[];
}

export async function POST(request: Request) {
  const player = await requirePlayer();
  if (!player) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { edits } = (await request.json()) as { edits?: EditInput[] };
  if (!Array.isArray(edits) || edits.length === 0) {
    return NextResponse.json({ ok: false, error: "No edits submitted." }, { status: 400 });
  }
  const MAX_VALUE_LENGTH = 5000;
  for (const edit of edits) {
    if (!edit || typeof edit.field !== "string" || !isEditableField(edit.field)) {
      return NextResponse.json({ ok: false, error: `"${edit?.field}" isn't an editable field.` }, { status: 400 });
    }
    const valueOk = edit.field === "history" ? Array.isArray(edit.value) : typeof edit.value === "string";
    if (!valueOk) {
      return NextResponse.json({ ok: false, error: `Invalid value for "${edit.field}".` }, { status: 400 });
    }
    const tooLong = Array.isArray(edit.value)
      ? edit.value.some((v) => typeof v !== "string" || v.length > MAX_VALUE_LENGTH)
      : edit.value.length > MAX_VALUE_LENGTH;
    if (tooLong) {
      return NextResponse.json({ ok: false, error: `"${edit.field}" is too long.` }, { status: 400 });
    }
  }

  const service = createSupabaseServiceRoleClient();
  const rows = edits.map((edit) => ({
    player_slug: player.playerSlug,
    field: edit.field,
    proposed_value: edit.value,
    submitted_at: new Date().toISOString(),
  }));
  const { error } = await service.from("player_profile_edits").upsert(rows, { onConflict: "player_slug,field" });
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not save your changes." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
