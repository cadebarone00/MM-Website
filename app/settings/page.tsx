import type { Metadata } from "next";
import Link from "next/link";
import { PhotoSetting } from "@/components/settings/PhotoSetting";
import { PrivacySetting } from "@/components/settings/PrivacySetting";
import { ProfileFieldsSetting } from "@/components/settings/ProfileFieldsSetting";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { SignOutButton } from "@/components/settings/SignOutButton";
import { OrganizerOffers } from "@/components/settings/OrganizerOffers";
import { ChangePasswordSetting } from "@/components/settings/ChangePasswordSetting";
import { DevicesSetting } from "@/components/settings/DevicesSetting";
import { myOrganizerOffers } from "@/lib/account/accountDeletion";
import deleteStyles from "@/components/settings/DeleteAccount.module.css";
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
 * Change password, Devices, Delete account, Sign Out (this device)) and Privacy (Rounds public / private). Signed-out visitors get Log In.
 */
export default async function SettingsPage() {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  const current = await getCurrentProfile();
  // Privacy and the photo are profile settings, so they only show once the account has its profile.
  const privacy = current.status === "ok" ? await getMyRoundsVisibility(current.profile.profileId) : null;
  const photo = current.status === "ok" ? await myPhotoPath(current.profile.profileId) : null;
  const fields = current.status === "ok" ? await getMyProfileForm(current.profile.profileId) : null;
  const offers = current.status === "ok" ? (await myOrganizerOffers(current.profile.profileId)).filter((offer) => !offer.declined) : [];

  return <SettingsScreen backHref="/profile"
    photo={current.status === "ok" && photo && <PhotoSetting initialUrl={profilePhotoUrl(photo.path)} initials={initialsOf(current.profile.displayName || current.profile.username)} available={photo.installed} />}
    account={user ? <>
      {fields ? <ProfileFieldsSetting email={user.email} initial={{ displayName: fields.displayName, username: fields.username, bio: fields.bio }} bioAvailable={fields.bioAvailable} />
        : user.email && <p className={styles.text}><span className={styles.muted}>Signed in as</span> {user.email}</p>}
      <ChangePasswordSetting />
      <DevicesSetting />
      <Link href="/settings/delete-account" className={deleteStyles.dangerLink}>Delete account</Link>
    </> : <>
      <p className={styles.text}>You&apos;re not signed in.</p>
      <Link href="/login" className={styles.linkButton}>Log In</Link>
    </>}
    offers={offers.length > 0 && <OrganizerOffers initial={offers} />}
    privacy={privacy && <PrivacySetting initial={privacy.visibility} />}
    signOut={user && <SignOutButton />} />;
}
