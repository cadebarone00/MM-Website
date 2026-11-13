import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MyTournamentsPage } from "@/components/platform/MyTournamentsPage";
import { loadOrganizerHome } from "@/lib/platform/tourneyScreensData";

export const metadata: Metadata = { title: "My Tournaments | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/** The organizer studio's home: the tournaments this signed-in user owns or organizes. */
export default async function TournamentsHomePage() {
  const data = await loadOrganizerHome();
  if (!data.signedIn) redirect("/login");
  return <MyTournamentsPage {...data} />;
}
