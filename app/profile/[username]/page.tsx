import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ProfileView } from "@/components/profile/ProfileView";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { loadProfileReadModel, profileIdForUsername } from "@/lib/profile/profileReadModelServer";
import styles from "../page.module.css";

export const metadata: Metadata = { title: "Profile | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Someone's profile by username (/profile/<username>, ignoring case). The username is resolved to a profile on the
 * server only; the page never gets an id or email. What shows follows the V1 privacy rules in the read model
 * (lib/profile/profileReadModel.ts). Your own username goes to /profile.
 */
export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const subjectId = await profileIdForUsername(decodeURIComponent(username));
  if (!subjectId) notFound();
  const current = await getCurrentProfile();
  const viewerId = current.status === "ok" ? current.profile.profileId : null;
  if (viewerId === subjectId) redirect("/profile");
  const profile = await loadProfileReadModel(viewerId, subjectId);
  if (!profile) notFound();
  return <div className={styles.page}><ProfileView profile={profile} /></div>;
}
