import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/** Public Wagers consumes only types Tiger has explicitly submitted. */
export async function GET() {
  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.from("wager_types").select("slug").eq("is_active", true);
  if (error) return NextResponse.json({ ok: true, slugs: [] });
  return NextResponse.json({ ok: true, slugs: (data ?? []).map((row) => row.slug) }, { headers: { "Cache-Control": "no-store" } });
}
