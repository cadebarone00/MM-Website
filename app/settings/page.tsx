import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SettingsView } from "@/components/settings/SettingsView";
import { loadSettings } from "@/lib/profile/profileScreensData";
import { appMode, MODE_COOKIE } from "@/lib/theme/appMode";

export const metadata: Metadata = { title: "Settings | The Maroon" };

/** Settings (website): loaded on the server by loadSettings, the same loader the app reads through /api/app/profile. */
export default async function SettingsPage() {
  return <SettingsView data={await loadSettings()} appearance={appMode((await cookies()).get(MODE_COOKIE)?.value)} />;
}
