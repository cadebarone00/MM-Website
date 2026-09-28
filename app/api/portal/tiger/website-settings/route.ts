import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getWebsiteSettings } from "@/lib/website/settingsServer";
import { parseYearChange } from "@/lib/website/settings";

export async function GET() {
  if (!await requireHost()) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  return NextResponse.json(await getWebsiteSettings(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const change = parseYearChange(await request.json().catch(() => null));
  if (!change) return NextResponse.json({ error: "Choose a valid section and year, or Automatic." }, { status: 400 });
  const service = createSupabaseServiceRoleClient();
  const { error } = await service.from("website_section_settings").upsert({
    section: change.section, season_year: change.year, updated_by: host.userId, updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: "Could not save. Check that website_section_settings.sql is installed, then retry." }, { status: 500 });
  return NextResponse.json({ ok: true, ...change }, { headers: { "Cache-Control": "no-store" } });
}
