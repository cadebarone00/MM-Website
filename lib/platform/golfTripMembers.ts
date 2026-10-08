import type { SavedGolfTrip } from "./golfTripCreate";

/**
 * Golf Trip members as each viewer may see them. A member row is one profile's participation in the trip
 * (golf_trip_members.profile_id = the golfer; NULL while it's still an invitation). Applied on the server, before
 * anything reaches the page: the organizer gets invite emails (to manage invitations); everyone else gets only
 * their own. Never hide emails in the screen instead.
 */
type Member = SavedGolfTrip["members"][number];

export function membersForViewer(members: Member[], viewerProfileId: string): Member[] {
  const isOrganizer = members.some((m) => m.role === "organizer" && m.profileId === viewerProfileId);
  return members.map((m) => isOrganizer || m.profileId === viewerProfileId ? m : { ...m, email: null });
}

export type MemberState = "organizer" | "accepted" | "pending" | "declined";

export function memberState(member: Pick<Member, "role" | "invitationStatus">): MemberState {
  if (member.role === "organizer") return "organizer";
  return member.invitationStatus === "accepted" ? "accepted" : member.invitationStatus === "declined" ? "declined" : "pending";
}

/** The trip's players: accepted members with a profile. Pending / declined invitations are never players. */
export const acceptedMembers = (members: Member[]) => members.filter((m) => m.profileId !== null && m.invitationStatus === "accepted");
