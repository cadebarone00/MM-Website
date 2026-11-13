import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ProfileView } from "@/components/profile/ProfileView";
import styles from "../page.module.css";
import { loadPublicProfile } from "@/lib/profile/profileScreensData";

export const metadata: Metadata = { title: "Profile | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Someone's profile by username (/profile/<username>, ignoring case). The username is resolved to a profile on the
 * server only; the page never gets an id or email. What shows follows the V1 privacy rules in the read model
 * (lib/profile/profileReadModel.ts). Your own username goes to /profile.
 */

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const data = await loadPublicProfile(decodeURIComponent(username));
  if (data.status === "not-found") notFound();
  if (data.status === "self") redirect("/profile");
  return <div className={styles.page}><ProfileView profile={data.profile} friendsCount={data.friends} friendship={data.friendship} /></div>;
}
