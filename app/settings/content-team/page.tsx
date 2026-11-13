import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentTeamView } from "@/components/settings/SettingsSubpages";
import { loadContentTeam } from "@/lib/profile/profileScreensData";

export const metadata: Metadata = { title: "Content team | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Settings → Content team (Admins only): Posters, their invites and post counts. Anyone else gets Not Found. */

export default async function ContentTeamPage() {
  const data = await loadContentTeam();
  if (data.status === "not-allowed") notFound();
  return <ContentTeamView members={data.members} sample={data.sample} />;
}
