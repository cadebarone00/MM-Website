import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!await requireHost()) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (typeof body?.id !== "string") return NextResponse.json({ ok: false, error: "Missing match." }, { status: 400 });
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("close_live_match_atomic", { p_box: body.id });
  if (error) return NextResponse.json({ ok: false, error: error.code === "P0001" ? error.message : "Closeout was not completed. Retry; the score and settlement will be saved together." }, { status: 400 });
  return NextResponse.json({ ok: true, result: data });
}
