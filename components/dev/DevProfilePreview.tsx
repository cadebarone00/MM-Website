"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ProfileSearch, type ProfileSearchSource } from "@/components/profile/ProfileSearch";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import { updateSampleProfile, useSampleProfile } from "@/components/dev/useSampleProfile";
import { EditProfileScreen } from "@/components/profile/EditProfileScreen";
import { SettingsView } from "@/components/settings/SettingsView";
import { DEFAULT_PREFERENCES, NOTIFICATION_TYPES, applyPreferenceChange, type Preferences } from "@/lib/profile/preferences";
import type { SettingsData } from "@/lib/profile/profileScreensData";
import { appMode } from "@/lib/theme/appMode";
import { ProfileView } from "@/components/profile/ProfileView";
import { SAMPLE_FRIENDS, SAMPLE_GOLFERS, sampleProfileReadModel, type SampleGolfer } from "@/lib/dev/sampleProfile";
import type { FriendRequest, GolferResult, Relation } from "@/lib/profile/friendRequestsServer";
import { profileEditFromBody } from "@/lib/profile/profileEdit";
import { profileSocialsFromBody } from "@/lib/profile/profileSocials";
import styles from "@/components/settings/Settings.module.css";

/**
 * DEV ONLY: the real Profile, Settings and Edit profile screens, run on the sample profile (lib/dev/sampleProfile.ts)
 * instead of a signed-in account. Saves go to the sample profile store (useSampleProfile), never to the server.
 */
// "?view=public" / "?view=private" (a Team Draft sample player's box) or "?user=<username>" (a search result) picks
// someone else's sample profile. Read with useSearchParams so following a link to it switches the profile straight away.
const LINKS = { settings: "/dev/profile/settings", edit: "/dev/profile/edit", search: "/dev/profile/search", profile: "/dev/profile" };

/** Sample "where we stand" with each sample golfer, kept for the browser tab so Search and their profiles agree. */
const relations = new Map<string, Relation>(SAMPLE_GOLFERS.filter((g) => g.username === "mikechen").map((g) => [g.id, "incoming" as Relation]));
let incoming: FriendRequest[] = SAMPLE_GOLFERS.filter((g) => g.username === "mikechen").map((g) => ({ id: `request-${g.id}`, profileId: g.id, name: g.displayName, username: g.username, photoUrl: null }));
const asResult = (g: SampleGolfer): GolferResult => ({ id: g.id, name: g.displayName, username: g.username, photoUrl: null, relation: relations.get(g.id) ?? "none", tripMate: false, isPrivate: g.roundsVisibility === "private", mutuals: g.mutuals });
function befriend(id: string, off: boolean): Relation {
  const now = relations.get(id) ?? "none";
  const next: Relation = off ? "none" : now === "incoming" ? "friends" : "requested";
  relations.set(id, next);
  if (next === "friends") incoming = incoming.filter((r) => r.profileId !== id);
  return next;
}

/** The Search page on sample golfers (no account). Suggestions: golfers with mutual friends first, then the rest, shuffled. */
const SAMPLE_SEARCH: ProfileSearchSource = {
  async search(query) {
    const words = query.toLowerCase().replace(/^@/, "");
    return SAMPLE_GOLFERS.filter((g) => g.displayName.toLowerCase().includes(words) || g.username.includes(words)).map(asResult);
  },
  async suggest() {
    const open = SAMPLE_GOLFERS.filter((g) => (relations.get(g.id) ?? "none") === "none");
    return [...open.filter((g) => g.mutuals > 0).sort((x, y) => y.mutuals - x.mutuals), ...open.filter((g) => !g.mutuals).sort(() => Math.random() - 0.5)].slice(0, 8).map(asResult);
  },
  async incoming() { return incoming; },
  async befriend(golfer) { return befriend(golfer.id, false); },
  async answer(request, accept) {
    incoming = incoming.filter((r) => r.id !== request.id);
    relations.set(request.profileId, accept ? "friends" : "none");
  },
  href: (username) => `/dev/profile?user=${encodeURIComponent(username)}`,
};

/** `user`: always show this sample golfer (the /dev/profile/public and /private pages). */
export function DevProfilePreview({ user: fixedUser }: { user?: string } = {}) {
  const params = useSearchParams();
  const view = params.get("view");
  const user = fixedUser ?? params.get("user");
  const linked = view === "public" || view === "private" ? view : null;
  const simulated = useSimulator()?.state.profilePreview;
  const preview = linked ?? simulated ?? "sample";
  const mine = useSampleProfile();
  const profile = useMemo(() => sampleProfileReadModel(preview, mine, new Date().toISOString().slice(0, 10), user), [preview, mine, user]);
  const golfer = profile.isOwner ? null : SAMPLE_GOLFERS.find((g) => g.username === profile.identity.username) ?? null;
  const compare = params.get("compare");
  return <ProfileView key={`${profile.identity.username}|${compare ?? ""}`} profile={profile} friendsCount={SAMPLE_FRIENDS} links={LINKS} compare={compare}
    friendship={golfer ? { profileId: golfer.id, relation: relations.get(golfer.id) ?? "none", tripMate: false } : undefined}
    friendSave={golfer ? async (off) => befriend(golfer.id, off) : undefined} />;
}

/** DEV ONLY: the Search page on sample golfers. The simulator's Search conditionals open it typed in. */
export function DevSearchPreview() {
  const state = useSimulator()?.state.profileSearch;
  const query = state === "results" ? "ke" : state === "none" ? "zzq" : "";
  return <ProfileSearch key={state ?? "open"} source={SAMPLE_SEARCH} backHref="/dev/profile" initialQuery={query} recentKey="maroon-dev-search-recent-v1" />;
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

const ALL_OFF = { ...DEFAULT_PREFERENCES, notifications: Object.fromEntries(NOTIFICATION_TYPES.map(({ id }) => [id, { push: false, email: false }])) as Preferences["notifications"] };
const SAMPLE_OFFER = [{ tripId: "00000000-0000-4000-8000-000000000011", tripName: "Pinehurst Weekend", fromName: "Jake Parker", accepted: false, declined: false }];

/** DEV ONLY: the real Settings on the sample profile. The simulator's Settings conditionals pick the sample state. */
export function DevSettingsPreview() {
  const mine = useSampleProfile();
  const sim = useSimulator()?.state.settingsPreview ?? "default";
  const data: SettingsData = {
    signedIn: true, email: "sample.golfer@example.com", preferences: sim === "allOff" ? ALL_OFF : mine.preferences,
    contentAdmin: sim === "admin", offers: sim === "offer" ? SAMPLE_OFFER : [],
  };
  // Keyed on the saved choices too: the first render (before this tab's saved sample is read) uses the defaults.
  return <SettingsView key={`${sim}|${JSON.stringify(data.preferences)}`} data={data} appearance={appMode(undefined)} dev={{
    backHref: "/dev/profile", deleteHref: "/dev/profile/delete-account",
    savePreference: async (change) => { const preferences = applyPreferenceChange(mine.preferences, change); updateSampleProfile({ preferences }); return preferences; },
    savePassword: async () => ({ ok: true }),
    signOut: <p className={styles.note}>Sample profile: changes stay in this preview. Sign Out is on the live Settings.</p>,
  }} />;
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
