import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TournamentDataPreview } from "../TournamentDataPreview";
import { MAROON_U_PREVIEW } from "@/lib/dev/maroonUPreviewFixture";

export const metadata: Metadata = { title: "Maroon U Active | The Maroon", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function MaroonUActivePage({ searchParams }: { searchParams: Promise<{ simulator?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  return <TournamentDataPreview fictional mock={MAROON_U_PREVIEW} maroon={MAROON_U_PREVIEW} unmapped={{}} embedded={params.simulator === "1"} settingsHref="/dev/tournament/maroon-u/settings" />;
}
