"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import type { ProfileSearchSource } from "@/components/profile/ProfileSearch";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import { updateSampleProfile, useSampleProfile } from "@/components/dev/useSampleProfile";
import { EditProfileScreen } from "@/components/profile/EditProfileScreen";
import { ProfileView } from "@/components/profile/ProfileView";
import { PhotoSetting } from "@/components/settings/PhotoSetting";
import { PrivacySetting } from "@/components/settings/PrivacySetting";
import { ProfileFieldsSetting } from "@/components/settings/ProfileFieldsSetting";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { SAMPLE_FRIENDS, SAMPLE_GOLFERS, sampleProfileReadModel } from "@/lib/dev/sampleProfile";
import type { FriendRequest, GolferResult } from "@/lib/profile/friendRequestsServer";
import { initialsFor } from "@/lib/profile/myProfile";
import { profileEditFromBody } from "@/lib/profile/profileEdit";
import { profileSocialsFromBody } from "@/lib/profile/profileSocials";
import styles from "@/components/settings/Settings.module.css";

/**
 * DEV ONLY: the real Profile, Settings and Edit profile screens, run on the sample profile (lib/dev/sampleProfile.ts)
 * instead of a signed-in account. Saves go to the sample profile store (useSampleProfile), never to the server.
 */
const LINKS = { settings: "/dev/profile/settings", edit: "/dev/profile/edit" };

// "?view=public" / "?view=private" (a Team Draft sample player's box, or a search result, links here) picks someone else's profile.
// Read with useSearchParams so following a search result to it switches the profile straight away.

/** The search bar on sample golfers (no account): Jake Parker (Public), Mike Chen (Private, who has sent you a friend request). */
function sampleSearch(): ProfileSearchSource {
  let golfers: GolferResult[] = SAMPLE_GOLFERS.map((g) => ({ id: g.id, name: g.displayName, username: g.username, photoUrl: null, relation: g.view === "private" ? "incoming" : "none", tripMate: false, isPrivate: g.view === "private" }));
  let incoming: FriendRequest[] = SAMPLE_GOLFERS.filter((g) => g.view === "private").map((g) => ({ id: `request-${g.id}`, profileId: g.id, name: g.displayName, username: g.username, photoUrl: null }));
  return {
    async search(query) {
      const words = query.toLowerCase().replace(/^@/, "");
      return golfers.filter((g) => g.name.toLowerCase().includes(words) || (g.username ?? "").toLowerCase().includes(words));
    },
    async incoming() { return incoming; },
    async befriend(golfer) {
      const relation = golfer.relation === "incoming" ? "friends" : "requested";
      golfers = golfers.map((g) => g.id === golfer.id ? { ...g, relation } : g);
      if (relation === "friends") incoming = incoming.filter((r) => r.profileId !== golfer.id);
      return relation;
    },
    async answer(request, accept) {
      incoming = incoming.filter((r) => r.id !== request.id);
      golfers = golfers.map((g) => g.id === request.profileId ? { ...g, relation: accept ? "friends" : "none" } : g);
    },
    href: (username) => `/dev/profile?view=${SAMPLE_GOLFERS.find((g) => g.username === username)?.view ?? "public"}`,
  };
}

export function DevProfilePreview() {
  const view = useSearchParams().get("view");
  const linked = view === "public" || view === "private" ? view : null;
  const search = useMemo(() => sampleSearch(), []);
  const simulated = useSimulator()?.state.profilePreview;
  const preview = linked ?? simulated ?? "sample";
  const mine = useSampleProfile();
  const profile = useMemo(() => sampleProfileReadModel(preview, mine, new Date().toISOString().slice(0, 10)), [preview, mine]);
  return <ProfileView profile={profile} friendsCount={SAMPLE_FRIENDS} links={LINKS} search={search} />;
}

/** The same checks the real save route makes (the database's username checks aren't simulated). */
function checked(body: object) {
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
  return <EditProfileScreen key={`${mine.displayName}|${mine.username}|${mine.bio}|${mine.gender}`} backHref="/dev/profile"
    initial={{ displayName: mine.displayName, username: mine.username, bio: mine.bio, bioAvailable: true, gender: mine.gender, genderAvailable: true,
      links: mine.links, linksAvailable: true, photoUrl: mine.photoUrl, photoAvailable: true, visibility: mine.visibility }}
    savers={{
      async profile(body) { updateSampleProfile(checked(body)); },
      async photo(file) { const photoUrl = file ? await readPhoto(file) : null; updateSampleProfile({ photoUrl }); return photoUrl; },
      async links(list) { const result = profileSocialsFromBody({ links: list }); if (!result.ok) throw new Error(result.error); updateSampleProfile({ links: result.socials }); return result.socials; },
      async visibility(visibility) { updateSampleProfile({ visibility }); },
    }} />;
}
