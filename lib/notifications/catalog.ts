/**
 * The master list of every notification The Maroon sends: one entry per type. The kinds list (`NOTIFICATION_KINDS`) and
 * the Settings → Notifications switches (`lib/profile/preferences.ts`) are both built from this file, so they can't drift
 * apart. Spec: project_specs.md → "Notifications cleanup — one catalog, every type on every screen" (2026-11-19).
 *
 * Wording: types written here have three versions (V1–V3); the app picks one. Golf highlights, travel alerts and organizer
 * messages keep their wording in the Highlights sheet (lib/highlights), so they point at its categories instead.
 * `approved: false` = preview wording only; nothing goes to a real phone until the owner approves it.
 */

/** Settings → Notifications switches, in the order Settings shows them. Ids are saved in profile_preferences. */
export const NOTIFICATION_SWITCHES = [
  { id: "friendRequests", label: "Friend requests", email: true },
  { id: "tripInvites", label: "Trip invites & requests", email: true },
  { id: "scoresPosted", label: "Round updates", email: false },
  { id: "bigMoments", label: "Big moments", email: false },
  { id: "travel", label: "Travel reminders", email: false },
  { id: "draftStarting", label: "Draft starting", email: false },
  { id: "yourPick", label: "Your turn to pick", email: false },
  { id: "chat", label: "Chat messages", email: false },
] as const;
export type NotificationSwitch = (typeof NOTIFICATION_SWITCHES)[number]["id"];

/** Where a type shows: the phone notification (push), the bell's list, the banner at the top while the app is open. */
export type NotificationSurface = "phone" | "bell" | "banner";
/** Icon names (drawn with lucide-react by the screens). */
export const NOTIFICATION_ICONS = ["flame", "calendarClock", "clipboardCheck", "alertTriangle", "trophy", "userPlus", "check", "x", "mail", "link", "plane", "megaphone", "users", "listOrdered", "timer", "messageCircle"] as const;
export type NotificationIcon = (typeof NOTIFICATION_ICONS)[number];

export type Wording = { title: string; body: string };

export type CatalogEntry = {
  kind: string;
  name: string;
  /** Settings switch that turns it off. Null = always on (can't be turned off). */
  switch: NotificationSwitch | null;
  icon: NotificationIcon;
  /** Who gets it. */
  audience: string;
  /** What makes it send. */
  trigger: string;
  /** In-app path opened on tap; `{Trip ID}` is filled in. */
  link: string;
  surfaces: readonly NotificationSurface[];
  /** V1, V2, V3 with `{Blank}` slots. Null = wording lives in the Highlights sheet (`sheetCategories`). */
  wording: readonly Wording[] | null;
  /** Highlights sheet categories (rule metadata "Notification Category") whose rules send this type. */
  sheetCategories?: readonly string[];
  /** Owner-approved wording. Sheet types follow each rule's own status in the sheet. */
  approved: boolean;
  /** Extra note shown on the All types page. */
  note?: string;
};

const ALL: readonly NotificationSurface[] = ["phone", "bell", "banner"];
const TRIP = "/golf-trips/{Trip ID}";

export const GOLF_SHEET_CATEGORIES = ["Individual performance", "Match play drama", "Team competition", "Individual leaderboard", "Trip and tournament milestones", "Fun and social highlights"] as const;
export const TRAVEL_SHEET_CATEGORIES = ["Flights", "Transportation", "Golf schedule", "Lodging", "Group activities", "Trip changes", "Trip milestones"] as const;

export const NOTIFICATION_CATALOG = [
  // ---------- Round updates ----------
  { kind: "teeTime", name: "Tee time soon", switch: "scoresPosted", icon: "calendarClock", audience: "Players with a tee time", trigger: "30 minutes before my tee time", link: `${TRIP}#golf`, surfaces: ALL, approved: false, wording: [
    { title: "Tee time in 30 minutes", body: "Round {Round} · {Course} · {Time}" },
    { title: "Almost go time ⛳", body: "You tee off at {Time} at {Course}." },
    { title: "Head to the first tee", body: "Round {Round} starts at {Time}. Good luck!" },
  ] },
  { kind: "opponentSubmitted", name: "Opponent submitted", switch: "scoresPosted", icon: "clipboardCheck", audience: "Players in the same match or group", trigger: "Someone in my match submits their card before me", link: `${TRIP}#golf`, surfaces: ALL, approved: false, wording: [
    { title: "{Player} submitted Round {Round}", body: "Check their card against yours before you submit." },
    { title: "{Player}'s card is in", body: "Compare scores, then submit yours." },
    { title: "Your turn to submit", body: "{Player} already turned in Round {Round}." },
  ] },
  { kind: "cardMismatch", name: "Card mismatch", switch: "scoresPosted", icon: "alertTriangle", audience: "Both players whose cards disagree", trigger: "Submitted cards in a match have different scores on a hole", link: `${TRIP}#golf`, surfaces: ALL, approved: false, wording: [
    { title: "Scores don't match on hole {Hole}", body: "You and {Player} have different scores. Take a look." },
    { title: "Quick check on hole {Hole}", body: "Your card and {Player}'s don't agree yet." },
    { title: "Card mismatch", body: "Hole {Hole} needs a second look before Round {Round} is final." },
  ] },
  { kind: "roundFinal", name: "Round final", switch: "scoresPosted", icon: "trophy", audience: "Everyone on the trip", trigger: "Every card in the round is submitted", link: `${TRIP}#golf`, surfaces: ALL, approved: false, wording: [
    { title: "Round {Round} is final", body: "See where you finished on the leaderboard." },
    { title: "That's a wrap on Round {Round} 🏁", body: "Results are in for {Course}." },
    { title: "Final scores are in", body: "Round {Round} at {Course} is locked. Check the standings." },
  ] },
  // ---------- Big moments (Highlights sheet) ----------
  { kind: "highlight", name: "Big moment", switch: "bigMoments", icon: "flame", audience: "Everyone on the trip (per rule)", trigger: "A Highlights rule fires during live scoring (birdie streaks, match swings, team leads …)", link: `${TRIP}#momentum`, surfaces: ALL, approved: false, wording: null, sheetCategories: GOLF_SHEET_CATEGORIES },
  // ---------- Travel (Highlights sheet, travel tab) ----------
  { kind: "travel", name: "Travel reminder", switch: "travel", icon: "plane", audience: "Travelers the item belongs to (per rule)", trigger: "A travel rule's reminder time (e.g. 24h before a flight)", link: `${TRIP}#itinerary`, surfaces: ALL, approved: false, wording: null, sheetCategories: TRAVEL_SHEET_CATEGORIES },
  { kind: "announcement", name: "Organizer message", switch: null, icon: "megaphone", audience: "Everyone on the trip", trigger: "The organizer posts an announcement", link: TRIP, surfaces: ALL, approved: false, wording: null, sheetCategories: ["Organizer messages"], note: "Always on: players can't turn off messages from their organizer." },
  // ---------- Trip invites & requests ----------
  { kind: "invited", name: "Trip invite", switch: "tripInvites", icon: "mail", audience: "The person invited", trigger: "Someone invites me to a trip", link: TRIP, surfaces: ALL, approved: false, wording: [
    { title: "You're invited to {Trip}", body: "{Player} invited you. Tap to accept or decline." },
    { title: "New trip invite ⛳", body: "{Player} wants you on {Trip}." },
    { title: "Join {Trip}?", body: "{Player} sent you an invite." },
  ] },
  { kind: "joinRequest", name: "Join request", switch: "tripInvites", icon: "userPlus", audience: "The trip organizer", trigger: "Someone asks to join the trip", link: `${TRIP}/settings`, surfaces: ALL, approved: false, wording: [
    { title: "{Player} wants to join", body: "{Trip} · tap to accept or decline" },
    { title: "New join request", body: "{Player} asked to join {Trip}." },
    { title: "Someone wants in", body: "{Player} would like to join {Trip}. Accept or decline." },
  ] },
  { kind: "requestAccepted", name: "Request accepted", switch: "tripInvites", icon: "check", audience: "The person who asked", trigger: "The organizer accepts my join request", link: TRIP, surfaces: ALL, approved: false, wording: [
    { title: "You're in! 🎉", body: "{Player} accepted your request to join {Trip}." },
    { title: "Welcome to {Trip}", body: "Your request was accepted. Take a look around." },
    { title: "Request accepted", body: "You've joined {Trip}." },
  ] },
  { kind: "requestDeclined", name: "Request declined", switch: "tripInvites", icon: "x", audience: "The person who asked", trigger: "The organizer declines my join request", link: "/golf-trips", surfaces: ["phone", "bell"], approved: false, wording: [
    { title: "Request not accepted", body: "{Trip} isn't taking new players right now." },
    { title: "No spot this time", body: "Your request to join {Trip} wasn't accepted." },
    { title: "Join request update", body: "{Trip} declined your request." },
  ] },
  { kind: "linkRequest", name: "Add past rounds", switch: "tripInvites", icon: "link", audience: "The player whose past rounds were entered", trigger: "An organizer links past trip rounds to my account", link: "/profile", surfaces: ALL, approved: false, wording: [
    { title: "{Trip} wants to add past rounds", body: "Add {Count} past rounds to your profile? Accept or decline." },
    { title: "Past rounds found", body: "{Trip} has {Count} rounds of yours. Add them to your profile?" },
    { title: "Link your history", body: "Accept to add {Count} rounds from {Trip} to your profile." },
  ] },
  // ---------- Friends ----------
  { kind: "friendRequest", name: "Friend request", switch: "friendRequests", icon: "users", audience: "The person asked", trigger: "Someone sends me a friend request", link: "/profile/friends", surfaces: ALL, approved: false, wording: [
    { title: "{Player} sent you a friend request", body: "Tap to accept or decline." },
    { title: "New friend request", body: "{Player} wants to be friends on The Maroon." },
    { title: "{Player} wants to connect", body: "Accept to see each other's rounds." },
  ] },
  // ---------- Drafts ----------
  { kind: "draftStarting", name: "Draft starting", switch: "draftStarting", icon: "listOrdered", audience: "Everyone in the draft", trigger: "15 minutes before the scheduled draft", link: `${TRIP}#draft`, surfaces: ALL, approved: false, wording: [
    { title: "The draft starts in 15 minutes", body: "{Trip} · get your picks ready." },
    { title: "Draft day 📋", body: "The {Trip} draft starts at {Time}." },
    { title: "Draft room is opening", body: "Join the {Trip} draft at {Time}." },
  ] },
  { kind: "yourPick", name: "Your turn to pick", switch: "yourPick", icon: "timer", audience: "The captain on the clock", trigger: "It becomes my pick in a draft", link: `${TRIP}#draft`, surfaces: ALL, approved: false, wording: [
    { title: "You're on the clock ⏱️", body: "It's your pick in the {Trip} draft." },
    { title: "Your turn to pick", body: "Make your pick in the {Trip} draft." },
    { title: "Pick time", body: "The {Trip} draft is waiting on you." },
  ] },
  // ---------- Chat ----------
  { kind: "chat", name: "Chat message", switch: "chat", icon: "messageCircle", audience: "Everyone in the chat except the sender", trigger: "A new message in a trip chat", link: `${TRIP}#chat`, surfaces: ["phone", "banner"], approved: false, wording: [
    { title: "{Player} · {Trip}", body: "{Message}" },
    { title: "{Player} in {Trip}", body: "{Message}" },
    { title: "{Trip}", body: "{Player}: {Message}" },
  ], note: "The message itself is the body. Chat stays in the chat, not the bell." },
] as const satisfies readonly CatalogEntry[];

export type NotificationKind = (typeof NOTIFICATION_CATALOG)[number]["kind"];
export const NOTIFICATION_KINDS = NOTIFICATION_CATALOG.map((entry) => entry.kind) as NotificationKind[];

export function catalogEntry(kind: NotificationKind): CatalogEntry {
  return NOTIFICATION_CATALOG.find((entry) => entry.kind === kind)!;
}

/** The types a Settings switch turns off. */
export function kindsForSwitch(id: NotificationSwitch): NotificationKind[] {
  return NOTIFICATION_CATALOG.filter((entry) => entry.switch === id).map((entry) => entry.kind);
}

/** Fills `{Blank}` slots ("{Trip}", "{Trip ID}"); a blank with no value stays as written so it's easy to spot. */
export function fillBlanks(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{([^{}]+)\}/g, (slot, name: string) => (name in values ? String(values[name]) : slot));
}

/** Every `{Blank}` a text uses. */
export function blanksIn(text: string): string[] {
  return [...text.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]);
}

/** Typical values for previews and length checks. */
export const CATALOG_SAMPLE_VALUES: Record<string, string> = {
  Player: "Collin Ross", Trip: "Desert Classic", "Trip ID": "00000000-0000-4000-8000-000000000001", Round: "2", Course: "PGA West Stadium",
  Time: "2:10 PM", Hole: "14", Count: "2", Message: "Who's driving to dinner tonight? I can take four.",
};
/** Worst cases (long names) for the push length check. */
export const CATALOG_LONG_VALUES: Record<string, string> = {
  ...CATALOG_SAMPLE_VALUES, Player: "Christopher Montgomery-Wellington", Trip: "Annual Scottsdale Spring Classic 2027", Course: "PGA West Jack Nicklaus",
  Message: "Running ten minutes late, save me a seat and order the wings. Also, does anyone have an extra sleeve of balls? Lost mine on 14.",
};
