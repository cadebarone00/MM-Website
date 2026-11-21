import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { UserFriendsList } from "@/components/profile/UserFriendsList";
import { loadUserFriends } from "@/lib/profile/profileScreensData";

export const metadata: Metadata = { title: "Friends | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Someone's Friends list (/profile/<username>/friends, owner request 2026-11-20): Public profiles only; your own goes to Search → Friends. */
export default async function UserFriendsPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const data = await loadUserFriends(decodeURIComponent(username));
  if (data.status === "not-found") notFound();
  if (data.status === "self") redirect("/profile/search?tab=friends");
  const name = data.username;
  return <UserFriendsList username={name} friends={data.status === "ok" ? data.friends : null} signedIn={data.status === "ok" && data.signedIn}
    backHref={`/profile/${encodeURIComponent(name)}`} />;
}
