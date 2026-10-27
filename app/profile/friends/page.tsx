import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FriendsList } from "@/components/profile/FriendsList";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { listFriends } from "@/lib/profile/friendRequestsServer";

export const metadata: Metadata = { title: "Friends | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Profile → Friends: everyone I'm friends with, with a search. Signed-in profiles only. */
export default async function FriendsPage() {
  const current = await getCurrentProfile();
  if (current.status !== "ok") redirect("/login");
  return <FriendsList friends={await listFriends(current.profile.profileId).catch(() => [])} />;
}
