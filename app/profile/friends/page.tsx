import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FriendsList } from "@/components/profile/FriendsList";
import { loadFriends } from "@/lib/profile/profileScreensData";

export const metadata: Metadata = { title: "Friends | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Profile → Friends: everyone I'm friends with, with a search. Signed-in profiles only. */

export default async function FriendsPage() {
  const data = await loadFriends();
  if (data.status !== "ok") redirect("/login");
  return <FriendsList friends={data.friends} />;
}
