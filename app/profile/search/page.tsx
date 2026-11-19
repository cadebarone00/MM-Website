import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProfileSearch } from "@/components/profile/ProfileSearch";
import { getCurrentProfile } from "@/lib/profile/currentProfile";

export const metadata: Metadata = { title: "Search | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Profile → magnifying glass: the Instagram-style Search page (friend requests, Recent, Suggested, results). Signed-in profiles only. */
export default async function SearchPage() {
  const current = await getCurrentProfile();
  if (current.status !== "ok") redirect("/login");
  return <ProfileSearch />;
}
