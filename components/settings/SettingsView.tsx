import Link from "next/link";
import { PhotoSetting } from "./PhotoSetting";
import { PrivacySetting } from "./PrivacySetting";
import { ProfileFieldsSetting } from "./ProfileFieldsSetting";
import { SettingsScreen } from "./SettingsScreen";
import { SignOutButton } from "./SignOutButton";
import { OrganizerOffers } from "./OrganizerOffers";
import { ChangePasswordSetting } from "./ChangePasswordSetting";
import { DevicesSetting } from "./DevicesSetting";
import { AppearanceSetting } from "./AppearanceSetting";
import type { AppMode } from "@/lib/theme/appMode";
import type { SettingsData } from "@/lib/profile/profileScreensData";
import deleteStyles from "./DeleteAccount.module.css";
import styles from "./Settings.module.css";

/**
 * Settings (the gear on Profile and in the account menu), in the app's look: Profile photo, Account (edit profile,
 * Change password, Devices, Delete account, Sign Out (this device)), Privacy (Rounds public / private) and Appearance (Dark /
 * Light, this device). Signed-out visitors get Log In. Shared by the website's /settings and the iPhone / Android app's.
 */
export function SettingsView({ data, appearance }: { data: SettingsData; appearance: AppMode }) {
  return <SettingsScreen backHref="/profile"
    photo={data.photo && <PhotoSetting initialUrl={data.photo.url} initials={data.photo.initials} available={data.photo.available} />}
    account={data.signedIn ? <>
      {data.fields ? <ProfileFieldsSetting email={data.email} initial={{ displayName: data.fields.displayName, username: data.fields.username, bio: data.fields.bio }} bioAvailable={data.fields.bioAvailable} />
        : data.email && <p className={styles.text}><span className={styles.muted}>Signed in as</span> {data.email}</p>}
      <ChangePasswordSetting />
      <DevicesSetting />
      <Link href="/settings/delete-account" className={deleteStyles.dangerLink}>Delete account</Link>
    </> : <>
      <p className={styles.text}>You&apos;re not signed in.</p>
      <Link href="/login" className={styles.linkButton}>Log In</Link>
    </>}
    contentTeam={data.contentAdmin && <>
      <p className={styles.text}><span className={styles.muted}>Invite Posters and see what they&apos;ve posted.</span></p>
      <Link href="/settings/content-team" className={styles.linkButton}>Open Content team</Link>
    </>}
    offers={data.offers.length > 0 && <OrganizerOffers initial={data.offers} />}
    privacy={data.privacy && <PrivacySetting initial={data.privacy} />}
    appearance={<AppearanceSetting initial={appearance} />}
    signOut={data.signedIn && <SignOutButton />} />;
}
