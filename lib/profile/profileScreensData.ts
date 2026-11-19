import "server-only";
import { loadMyProfile, type MyProfilePage } from "./myProfileServer";
import { getCurrentProfile } from "./currentProfile";
import { friendCount } from "./friendsServer";
import { getMyProfileForm } from "./profileEditServer";
import { myPhotoPath, profilePhotoUrl } from "./profilePhoto";
import { getMyRoundsVisibility } from "@/lib/platform/playerRoundsServer";
import { getMyPreferences } from "./preferencesServer";
import type { Preferences } from "./preferences";
import { myOrganizerOffers } from "@/lib/account/accountDeletion";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isRibbonSampleEnabled } from "@/lib/content/ribbonSample";
import { canPublish, postCounts } from "@/lib/content/ribbon";
import { contentViewer, loadItems, loadTeam } from "@/lib/content/ribbonServer";
import { sampleContentTeam, sampleRibbonItems } from "@/lib/content/ribbonSample";
import { myFriendRequests, listFriends, friendshipWith, type FriendRequest, type FriendListItem, type Relation } from "./friendRequestsServer";
import { loadProfileReadModel, profileIdForUsername } from "./profileReadModelServer";
import type { ProfileReadModel } from "./profileReadModel";
import { deletionPreview } from "@/lib/account/accountDeletion";
import type { ContentTeam } from "@/components/settings/ContentTeam";
import type { DeletionPreviewData } from "@/components/settings/DeleteAccountFlow";
import type { OrganizerOfferItem } from "@/components/settings/OrganizerOffers";
import type { EditProfileInitial } from "@/components/profile/EditProfileScreen";

/**
 * Profile, Edit profile and Settings for whoever is signed in — shared by the website's pages (app/profile,
 * app/profile/edit, app/settings) and the iPhone / Android app's data route (/api/app/profile), so both show the same
 * thing. Plain data only, so it can be sent to the app as JSON.
 */
export async function loadMyProfileScreen(): Promise<{ page: MyProfilePage; friends: number | null }> {
  const page = await loadMyProfile();
  if (page.status !== "ok") return { page, friends: null };
  const current = await getCurrentProfile();
  const friends = current.status === "ok" ? await friendCount(current.profile.profileId).catch(() => null) : null;
  return { page, friends };
}

/** Edit profile (Instagram-style, 2026-11-13): the form plus the photo and the Private profile setting. */
export type EditProfileData = { status: "signed-out" } | { status: "no-profile" } | { status: "ok"; form: EditProfileInitial };
export async function loadEditProfile(): Promise<EditProfileData> {
  const current = await getCurrentProfile();
  if (current.status === "signed-out") return { status: "signed-out" };
  if (current.status !== "ok") return { status: "no-profile" };
  const profileId = current.profile.profileId;
  const [form, photo, privacy] = await Promise.all([getMyProfileForm(profileId), myPhotoPath(profileId), getMyRoundsVisibility(profileId)]);
  if (!form) return { status: "no-profile" };
  return { status: "ok", form: { ...form, photoUrl: profilePhotoUrl(photo.path), photoAvailable: photo.installed, visibility: privacy.status === "ok" ? privacy.visibility : null } };
}

/** Settings (redo 2026-11-19): Account, Notifications, Golf preferences, Appearance, Organizer, Help & legal. Profile
 *  things (photo, name, bio, Private profile) are in Edit profile, not here. `preferences` null = the SQL isn't run yet. */
export interface SettingsData {
  signedIn: boolean;
  email: string | null;
  preferences: Preferences | null;
  contentAdmin: boolean;
  offers: OrganizerOfferItem[];
}
export async function loadSettings(): Promise<SettingsData> {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  const current = await getCurrentProfile();
  const ok = current.status === "ok" ? current.profile : null;
  const [preferences, viewer, offers] = await Promise.all([
    ok ? getMyPreferences(ok.profileId) : null,
    isRibbonSampleEnabled() ? null : contentViewer(),
    ok ? myOrganizerOffers(ok.profileId) : [],
  ]);
  return {
    signedIn: Boolean(user), email: user?.email ?? null, preferences,
    contentAdmin: isRibbonSampleEnabled() || (viewer ? canPublish(viewer) : false),
    offers: offers.filter((offer) => !offer.declined),
  };
}

// ---------------------------------------------------------------- Find golfers, Friends, someone's profile, Delete account, Content team

export type FindGolfersData = { status: "signed-out" } | { status: "ok"; incoming: FriendRequest[]; setupMessage: string | null };
export async function loadFindGolfers(): Promise<FindGolfersData> {
  const current = await getCurrentProfile();
  if (current.status !== "ok") return { status: "signed-out" };
  const requests = await myFriendRequests(current.profile.profileId);
  return { status: "ok", incoming: requests.ok ? requests.value.incoming : [], setupMessage: requests.ok ? null : requests.message };
}

export type FriendsData = { status: "signed-out" } | { status: "ok"; friends: FriendListItem[] };
export async function loadFriends(): Promise<FriendsData> {
  const current = await getCurrentProfile();
  if (current.status !== "ok") return { status: "signed-out" };
  return { status: "ok", friends: await listFriends(current.profile.profileId).catch(() => []) };
}

/** Someone else's profile by username. "self" = it's the viewer's own (the page shows /profile instead). */
export type PublicProfileData = { status: "not-found" } | { status: "self" }
  | { status: "ok"; profile: ProfileReadModel; friends: number | null; friendship?: { profileId: string; relation: Relation; tripMate: boolean } };
export async function loadPublicProfile(username: string): Promise<PublicProfileData> {
  const subjectId = await profileIdForUsername(username);
  if (!subjectId) return { status: "not-found" };
  const current = await getCurrentProfile();
  const viewerId = current.status === "ok" ? current.profile.profileId : null;
  if (viewerId === subjectId) return { status: "self" };
  const profile = await loadProfileReadModel(viewerId, subjectId);
  if (!profile) return { status: "not-found" };
  const friends = await friendCount(subjectId).catch(() => null);
  // Signed in: the friend button in the corner shows (and switches) where we stand.
  const friendship = viewerId ? { profileId: subjectId, ...await friendshipWith(viewerId, subjectId).catch(() => ({ relation: "none" as const, tripMate: false })) } : undefined;
  return { status: "ok", profile, friends, friendship };
}

export type DeleteAccountData = { status: "signed-out" } | { status: "ok"; preview: DeletionPreviewData | null };
export async function loadDeleteAccount(): Promise<DeleteAccountData> {
  const current = await getCurrentProfile();
  if (current.status === "signed-out") return { status: "signed-out" };
  return { status: "ok", preview: await deletionPreview(current.account.id) as DeletionPreviewData | null };
}

/** Settings → Content team (Content Admins only; the sample team in sample mode). */
export type ContentTeamData = { status: "not-allowed" } | { status: "ok"; members: Parameters<typeof ContentTeam>[0]["initial"]; sample: boolean };
export async function loadContentTeam(): Promise<ContentTeamData> {
  const sample = isRibbonSampleEnabled();
  const viewer = sample ? null : await contentViewer();
  if (viewer && !canPublish(viewer)) return { status: "not-allowed" };
  const items = viewer ? await loadItems(viewer) : sampleRibbonItems();
  const members = viewer ? await loadTeam(items) : sampleContentTeam().map((member) => ({ ...member, counts: postCounts(items, member.profileId) }));
  return { status: "ok", members, sample };
}
