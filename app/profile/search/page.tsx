import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FindGolfers } from "@/components/profile/FindGolfers";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { myFriendRequests } from "@/lib/profile/friendRequestsServer";

export const metadata: Metadata = { title: "Find Golfers | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Profile → magnifying glass: search golfers and ask to be friends; requests waiting on me show too. Signed-in profiles only. */
export default async function FindGolfersPage() {
  const current = await getCurrentProfile();
  if (current.status !== "ok") redirect("/login");
  const requests = await myFriendRequests(current.profile.profileId);
  return <FindGolfers incoming={requests.ok ? requests.value.incoming : []} setupMessage={requests.ok ? null : requests.message} />;
}
