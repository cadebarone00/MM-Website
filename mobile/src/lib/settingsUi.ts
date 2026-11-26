/**
 * Settings + Delete account helpers (pure, unit-tested; project_specs.md "Expo app Step 3", part 3d).
 */

export type OrganizerOffer = { tripId: string; tripName: string; fromName: string; accepted: boolean; declined: boolean };

/** New login tokens the server hands a phone after Change password / Sign out of other devices (null = none). */
export function tokensFrom(body: unknown): { access_token: string; refresh_token: string } | null {
  const session = body && typeof body === "object" ? (body as { session?: unknown }).session : null;
  if (!session || typeof session !== "object") return null;
  const { access_token, refresh_token } = session as Record<string, unknown>;
  return typeof access_token === "string" && access_token && typeof refresh_token === "string" && refresh_token ? { access_token, refresh_token } : null;
}

/** Delete my account is only tappable with a password and DELETE typed in capitals (spaces around are ignored), like the website. */
export function canConfirmDelete(password: string, typed: string, busy: boolean): boolean {
  return !busy && password.length > 0 && typed.trim() === "DELETE";
}

/** An offer after I answer it. */
export function answeredOffer(offer: OrganizerOffer, accept: boolean): OrganizerOffer {
  return { ...offer, accepted: accept, declined: !accept };
}

/** "Mar 3, 2027" for a trip's yyyy-mm-dd date (noon, so no time zone shifts the day). */
export function tripDay(iso: string): string {
  const day = new Date(`${iso}T12:00:00`);
  return Number.isNaN(day.getTime()) ? iso : day.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
