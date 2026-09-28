import { cache } from "react";
import { headers } from "next/headers";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { emptyWebsiteSettings, isDisplayYear, isWebsiteSection, isCatalogScope, type CatalogScope } from "./settings";

export const getWebsiteSettings = cache(async () => {
  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.from("website_section_settings").select("section, season_year");
  const settings = emptyWebsiteSettings();
  for (const row of data ?? []) {
    if (isWebsiteSection(row.section) && (row.season_year === null || isDisplayYear(row.season_year))) {
      settings[row.section] = row.season_year;
    }
  }
  // Existing sites retain their calendar behavior until the migration is installed.
  return { settings, available: !error };
});

export async function getRequestWebsiteSection(): Promise<CatalogScope> {
  const value = (await headers()).get("x-mm-website-section");
  return isCatalogScope(value) ? value : "home";
}
