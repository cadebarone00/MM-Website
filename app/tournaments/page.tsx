import type { Metadata } from "next";
import { MyTournamentsPage } from "@/components/platform/MyTournamentsPage";

export const metadata: Metadata = { title: "My Tournaments | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/** The organizer studio's home: the tournaments this signed-in user owns or organizes. */
export default function TournamentsHomePage() {
  return <MyTournamentsPage />;
}
