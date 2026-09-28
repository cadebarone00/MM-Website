import Link from "next/link";
import { redirect } from "next/navigation";
import { requireHost } from "@/lib/portal/requireHost";
import { getWebsiteSettings } from "@/lib/website/settingsServer";
import { WebsiteSettingsPanel } from "@/components/portal/tiger/WebsiteSettingsPanel";

export default async function WebsiteSettingsPage() {
  if (!await requireHost()) redirect("/login");
  const { settings, available } = await getWebsiteSettings();
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
    <Link href="/portal/admin" className="underline">Back to Tiger Center</Link>
    <h1 className="font-serif text-3xl font-bold">Website settings</h1>
    <Link href="/portal/admin/website-editor" className="inline-block rounded bg-maroon-700 px-4 py-3 text-white">Edit on the website</Link>
    <WebsiteSettingsPanel initial={settings} available={available} />
    <p className="text-sm text-ink-600">Tournament data uses the existing year-specific Master Settings: dates, venue, courses, formats, tee times, players, teams, and matchups. The website editor opens those same controls. Display-year settings do not change the active scoring or betting season. Historical records keep their year-specific URLs.</p>
  </main>;
}
