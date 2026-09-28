import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getWebsiteSettings } from "@/lib/website/settingsServer";
import { saveWebsiteSetting } from "@/lib/website/settingsApi";

export async function GET() {
  if (!await requireHost()) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  return NextResponse.json(await getWebsiteSettings(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  return saveWebsiteSetting(request, {
    authorize: requireHost,
    write: async (change, userId) => {
      const service = createSupabaseServiceRoleClient();
      const { error } = await service.from("website_section_settings").upsert({
        section: change.section, season_year: change.year, updated_by: userId, updated_at: new Date().toISOString(),
      });
      return !error;
    },
  });
}
