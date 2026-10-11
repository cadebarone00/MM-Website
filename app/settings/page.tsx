import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PhotoSetting } from "@/components/settings/PhotoSetting";
import { PrivacySetting } from "@/components/settings/PrivacySetting";
import { ProfileFieldsSetting } from "@/components/settings/ProfileFieldsSetting";
import { SignOutButton } from "@/components/settings/SignOutButton";
import { getMyRoundsVisibility } from "@/lib/platform/playerRoundsServer";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { myPhotoPath, profilePhotoUrl } from "@/lib/profile/profilePhoto";
import { getMyProfileForm } from "@/lib/profile/profileEditServer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "@/components/settings/Settings.module.css";

export const metadata: Metadata = { title: "Settings | The Maroon" };

const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("") || "?";

/**
 * Settings (the gear on Profile and in the account menu), in the app's look: Profile photo, Account (edit profile,
 * Sign Out) and Privacy (Rounds public / private). Signed-out visitors get Log In.
 */
export default async function SettingsPage() {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  const current = await getCurrentProfile();
  // Privacy and the photo are profile settings, so they only show once the account has its profile.
  const privacy = current.status === "ok" ? await getMyRoundsVisibility(current.profile.profileId) : null;
  const photo = current.status === "ok" ? await myPhotoPath(current.profile.profileId) : null;
  const fields = current.status === "ok" ? await getMyProfileForm(current.profile.profileId) : null;

  return <main className={styles.page}>
    <div className={styles.inner}>
      <header className={styles.header}>
        <Link href="/profile" className={styles.back} aria-label="Back to Profile"><ArrowLeft size={18} aria-hidden="true" /></Link>
        <span className={styles.backLabel}>Profile</span><h1 className="sr-only">Settings</h1>
      </header>

      {current.status === "ok" && photo && <section aria-labelledby="settings-photo" className={styles.card}>
        <h2 id="settings-photo" className={styles.cardTitle}>Profile photo</h2>
        <PhotoSetting initialUrl={profilePhotoUrl(photo.path)} initials={initialsOf(current.profile.displayName || current.profile.username)} available={photo.installed} />
      </section>}

      <section aria-labelledby="settings-account" className={styles.card}>
        <h2 id="settings-account" className={styles.cardTitle}>Account</h2>
        {user ? <>
          {fields ? <ProfileFieldsSetting email={user.email} initial={{ displayName: fields.displayName, username: fields.username, bio: fields.bio }} bioAvailable={fields.bioAvailable} />
            : user.email && <p className={styles.text}><span className={styles.muted}>Signed in as</span> {user.email}</p>}
        </> : <>
          <p className={styles.text}>You&apos;re not signed in.</p>
          <Link href="/login" className={styles.linkButton}>Log In</Link>
        </>}
      </section>

      {privacy && <section aria-labelledby="settings-privacy" className={`${styles.card} ${styles.compactCard}`}>
        <PrivacySetting initial={privacy.visibility} />
      </section>}

      {/* Sign Out sits at the very bottom, on its own. */}
      {user && <div className={styles.signOut}><SignOutButton /></div>}
    </div>
  </main>;
}
