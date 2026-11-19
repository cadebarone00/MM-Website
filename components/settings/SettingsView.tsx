import Link from "next/link";
import type { ReactNode } from "react";
import { SettingsScreen } from "./SettingsScreen";
import { SignOutButton } from "./SignOutButton";
import { OrganizerOffers } from "./OrganizerOffers";
import { ChangePasswordSetting } from "./ChangePasswordSetting";
import { DevicesSetting } from "./DevicesSetting";
import { AppearanceSetting } from "./AppearanceSetting";
import { GolfPreferences, HelpLegal, NotificationSettings, type SavePreference } from "./PreferenceSettings";
import { APP_VERSION } from "@/lib/appVersion";
import type { AppMode } from "@/lib/theme/appMode";
import type { SettingsData } from "@/lib/profile/profileScreensData";
import deleteStyles from "./DeleteAccount.module.css";
import styles from "./Settings.module.css";

/** Dev profile preview only: where things save and link instead of the live account. */
export interface SettingsDevOptions {
  backHref: string; savePreference: SavePreference; savePassword: (current: string, next: string) => Promise<{ ok: boolean; error?: string }>;
  deleteHref: string; signOut: ReactNode;
}

/**
 * Settings (the gear on Profile), redo 2026-11-19: Account (email, password, devices), Notifications, Golf preferences,
 * Appearance, Organizer (shown to everyone: what organizer settings look like), Help & legal, Sign out, Delete account.
 * Signed-out visitors get Log In. Shared by the website's /settings, the iPhone / Android app's, and the dev preview.
 */
export function SettingsView({ data, appearance, dev }: { data: SettingsData; appearance: AppMode; dev?: SettingsDevOptions }) {
  return <SettingsScreen backHref={dev?.backHref ?? "/profile"}
    account={data.signedIn ? <>
      {data.email && <p className={styles.text}><span className={styles.muted}>Email</span> {data.email}</p>}
      <ChangePasswordSetting onSave={dev?.savePassword} />
      <DevicesSetting />
    </> : <>
      <p className={styles.text}>You&apos;re not signed in.</p>
      <Link href="/login" className={styles.linkButton}>Log In</Link>
    </>}
    notifications={data.preferences && <NotificationSettings initial={data.preferences} save={dev?.savePreference} />}
    golf={data.preferences && <GolfPreferences initial={data.preferences} save={dev?.savePreference} />}
    appearance={<AppearanceSetting initial={appearance} />}
    organizer={data.signedIn && <>
      <p className={`${styles.text} ${styles.organizerIntro}`}><span className={styles.muted}>When you organize a tournament or trip, your organizer tools live here.</span></p>
      <ul className={styles.rowList}>
        <li>{data.offers.length > 0 ? <OrganizerOffers initial={data.offers} />
          : <span className={`${styles.row} ${styles.rowOff}`}><span>Organizer offers</span><span className={styles.muted}>No offers right now</span></span>}</li>
        <li>{data.contentAdmin
          ? <Link href="/settings/content-team" className={styles.row}><span>Content team</span><span className={styles.muted}>Invite Posters ›</span></Link>
          : <span className={`${styles.row} ${styles.rowOff}`} aria-disabled="true"><span>Content team</span><span className={styles.soonTag}>For content admins</span></span>}</li>
      </ul>
    </>}
    help={<HelpLegal version={APP_VERSION} />}
    signOut={dev?.signOut ?? (data.signedIn && <SignOutButton />)}
    deleteAccount={data.signedIn && <Link href={dev?.deleteHref ?? "/settings/delete-account"} className={deleteStyles.dangerLink}>Delete account</Link>} />;
}
