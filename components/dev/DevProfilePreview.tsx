"use client";

import { useMemo } from "react";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import { updateSampleProfile, useSampleProfile } from "@/components/dev/useSampleProfile";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { ProfileView } from "@/components/profile/ProfileView";
import { PhotoSetting } from "@/components/settings/PhotoSetting";
import { PrivacySetting } from "@/components/settings/PrivacySetting";
import { ProfileFieldsSetting } from "@/components/settings/ProfileFieldsSetting";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { SAMPLE_FRIENDS, sampleProfileReadModel } from "@/lib/dev/sampleProfile";
import { initialsFor } from "@/lib/profile/myProfile";
import { profileEditFromBody } from "@/lib/profile/profileEdit";
import styles from "@/components/settings/Settings.module.css";

/**
 * DEV ONLY: the real Profile, Settings and Edit profile screens, run on the sample profile (lib/dev/sampleProfile.ts)
 * instead of a signed-in account. Saves go to the sample profile store (useSampleProfile), never to the server.
 */
const LINKS = { settings: "/dev/profile/settings", edit: "/dev/profile/edit" };

export function DevProfilePreview() {
  const preview = useSimulator()?.state.profilePreview ?? "sample";
  const mine = useSampleProfile();
  const profile = useMemo(() => sampleProfileReadModel(preview, mine, new Date().toISOString().slice(0, 10)), [preview, mine]);
  return <ProfileView profile={profile} friendsCount={SAMPLE_FRIENDS} links={LINKS} />;
}

/** The same checks the real save route makes (the database's username checks aren't simulated). */
function checked(body: Record<string, string>) {
  const result = profileEditFromBody(body);
  if (!result.ok) throw new Error(result.error);
  return result.input;
}

const readPhoto = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error("Couldn't read that photo. Try another."));
  reader.readAsDataURL(file);
});

export function DevSettingsPreview() {
  const mine = useSampleProfile();
  // Keys remount each card when the sample profile changes underneath it (e.g. after Edit profile).
  return <SettingsScreen backHref="/dev/profile"
    photo={<PhotoSetting key={mine.photoUrl ?? "none"} initialUrl={mine.photoUrl} initials={initialsFor(mine.displayName || mine.username)} available
      onSave={async (file) => { const photoUrl = file ? await readPhoto(file) : null; updateSampleProfile({ photoUrl }); return photoUrl; }} />}
    account={<ProfileFieldsSetting key={`${mine.displayName}|${mine.username}|${mine.bio}`} email="sample.golfer@example.com" bioAvailable
      initial={{ displayName: mine.displayName, username: mine.username, bio: mine.bio }}
      onSave={async (field, value) => { updateSampleProfile(checked({ [field]: value })); }} />}
    privacy={<PrivacySetting key={mine.visibility} initial={mine.visibility} onSave={async (visibility) => { updateSampleProfile({ visibility }); }} />}
    signOut={<p className={styles.note}>Sample profile: changes stay in this preview. Sign Out is on the live Settings.</p>} />;
}

export function DevEditProfilePreview() {
  const mine = useSampleProfile();
  return <ProfileForm key={`${mine.displayName}|${mine.username}|${mine.bio}`} mode="edit" doneHref="/dev/profile"
    initial={{ displayName: mine.displayName, username: mine.username, bio: mine.bio }}
    onSave={async (body) => { updateSampleProfile(checked(body)); }} />;
}
