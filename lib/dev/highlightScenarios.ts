/**
 * DEV ONLY: the Highlights scenarios for the simulator's existing Notifications group (spec: "Highlights Phase H4.5 + H5A").
 * Fixtures: a sample trip (the people, teams and tee groups the Notifications previews already use), its itinerary and
 * the rule config from lib/dev/highlightsSnapshot.json (a snapshot of the Google Sheet export — not published, not what
 * production reads). Decisions and rendering use the real engine (lib/highlights/engine), never a mock copy of it.
 * Flight / ride statuses exist only where a fixture states them explicitly; nothing assumes live airline or ride data.
 */
import snapshot from "./highlightsSnapshot.json";
import { ruleProfile, TRIP_TYPES, PREFERENCE_CATEGORIES, type PreferenceCategory, type TripType } from "@/lib/highlights/metadata";
import { competitionProfile, setupFor } from "@/lib/highlights/engine/competition";
import { effectivePreferences, DEFAULT_PREFERENCES, GOLF_INTENSITIES, type GolfIntensity } from "@/lib/highlights/engine/preferences";
import { evaluateAlert, type AlertEvent, type Evaluation } from "@/lib/highlights/engine/evaluate";
import { groupValues, matchValues, teamValues, type Side } from "@/lib/highlights/engine/values";
import { reminderSendAt } from "@/lib/highlights/engine/delivery";
import { seededRandom } from "@/lib/highlights/engine/selection";
import { recipients, type AudienceContext } from "@/lib/highlights/engine/audience";
import type { HighlightConfig } from "@/lib/highlights/types";
import type { TemplateValues } from "@/lib/highlights/template";
import type { AppNotification, NotificationKind } from "@/lib/notifications/types";

export const SNAPSHOT = snapshot as unknown as { label: string; configFingerprint: string; report: { errors: string[]; warnings: number }; counts: Record<string, number>; config: HighlightConfig };

// --- The sample trip ------------------------------------------------------------------------------------------------

export const SIM_TRIP = { id: "00000000-0000-4000-8000-000000000001", name: "Desert Classic", timeZone: "America/Los_Angeles" };
export const SIM_MEMBERS = [
  { id: "cade", name: "Cade Barone", team: "Maroon", group: 1 }, { id: "cam", name: "Cam Latto", team: "Maroon", group: 1 },
  { id: "collin", name: "Collin Ross", team: "White", group: 1 }, { id: "mike", name: "Mike Chen", team: "White", group: 1 },
  { id: "jake", name: "Jake Parker", team: "Maroon", group: 2 }, { id: "pete", name: "Pete Peabody", team: "Maroon", group: 2 },
  { id: "alex", name: "Alex Rivera", team: "White", group: 2 }, { id: "luke", name: "Luke Sherrell", team: "White", group: 2 },
] as const;
export type MemberId = (typeof SIM_MEMBERS)[number]["id"];
const MEMBER_IDS = SIM_MEMBERS.map((m) => m.id) as readonly string[];
const member = (id: string) => SIM_MEMBERS.find((m) => m.id === id)!;
const first = (id: string) => member(id).name.split(" ")[0];

export const SIM_ROUNDS = [
  { round: 1, course: "Mission Hills (Dinah Shore)", startsAt: "2026-10-15T08:00" },
  { round: 2, course: "PGA West Stadium", startsAt: "2026-10-16T14:10" },
  { round: 3, course: "PGA West Nicklaus", startsAt: "2026-10-17T09:00" },
] as const;

/** Itinerary fixtures. Every value a travel alert can show is stated here — no live data is assumed. */
export const SIM_ITEMS = {
  flight: { title: "AA 1234 to Palm Springs", startsAt: "2026-10-15T07:30", travelers: ["cade", "cam", "jake"], values: { "Flight Number": "AA 1234", Destination: "Palm Springs", Time: "7:30 AM" } },
  pickup: { title: "Airport pickup", startsAt: "2026-10-15T10:00", travelers: ["cade", "cam", "jake"], driver: "pete", values: { Location: "PSP arrivals curb", Time: "10:00 AM" } },
  rental: { title: "Rental car (Hertz)", startsAt: "2026-10-15T09:30", travelers: ["pete", "alex", "luke"], driver: "pete", values: { Location: "Hertz, PSP", Time: "9:30 AM" } },
  rentalReturn: { title: "Rental car return", startsAt: "2026-10-18T10:00", travelers: ["pete", "alex", "luke"], driver: "pete", values: { Location: "Hertz, PSP", Time: "10:00 AM" } },
  carpool: { title: "Van 1 to the course", startsAt: "2026-10-16T13:30", travelers: ["cade", "jake", "pete"], driver: "cam", values: { "Carpool Name": "Van 1", Location: "La Quinta main lobby", Time: "1:30 PM" } },
  shuttle: { title: "Shuttle to PGA West", startsAt: "2026-10-17T07:45", travelers: ["collin", "mike", "alex", "luke"], values: { Location: "Hotel front drive", Time: "7:45 AM" } },
  checkIn: { title: "La Quinta check-in", startsAt: "2026-10-15T15:00", travelers: MEMBER_IDS, values: { Property: "La Quinta Resort", Time: "3:00 PM" } },
  checkOut: { title: "La Quinta check-out", startsAt: "2026-10-18T11:00", travelers: MEMBER_IDS, values: { Property: "La Quinta Resort", Time: "11:00 AM" } },
  dinner: { title: "Team dinner", startsAt: "2026-10-16T19:30", travelers: ["cade", "cam", "collin", "mike", "jake", "pete", "alex"], values: { Venue: "Mastro's", Time: "7:30 PM", "Event Name": "Team dinner", Date: "Fri, Oct 16" } },
  activity: { title: "Pool + draft night", startsAt: "2026-10-15T20:00", travelers: MEMBER_IDS, values: { "Event Name": "Pool + draft night", Time: "8:00 PM", Date: "Thu, Oct 15" } },
  teeTime: { title: "Round 2 · PGA West Stadium", startsAt: "2026-10-16T14:10", travelers: MEMBER_IDS, values: { Course: "PGA West Stadium", Time: "2:10 PM", Round: "2" } },
  arrival: { title: "Trip starts", startsAt: "2026-10-15T07:00", travelers: MEMBER_IDS, values: {} },
} satisfies Record<string, { title: string; startsAt: string; travelers: readonly string[]; driver?: string; values: TemplateValues }>;
type ItemId = keyof typeof SIM_ITEMS;

// --- Simulator state ------------------------------------------------------------------------------------------------

export const VARIATION_CHOICES = ["random", "V01", "V02", "V03"] as const;
export const DELIVERY_STATES = [["delivered", "Delivered (shown now)"], ["scheduled", "Scheduled (not sent yet)"], ["withdrawn", "Withdrawn after a score correction"]] as const;
export type HighlightSim = {
  /** "design": the original sample notifications. "engine": the Highlights Engine + this scenario. */
  source: "design" | "engine";
  scenario: string;
  tripType: TripType;
  teamCompetition: boolean;
  matchFormat: "singles" | "fourball";
  /** Make the moment about the other side (Team A ↔ Team B). */
  swapSides: boolean;
  /** Whose golf moment it is. */
  subject: MemberId;
  /** Whose phone we're looking at. */
  recipient: MemberId;
  intensity: GolfIntensity;
  /** Per-trip override of the golf intensity. */
  tripIntensity: "inherit" | GolfIntensity;
  categoriesOff: PreferenceCategory[];
  variation: (typeof VARIATION_CHOICES)[number];
  seed: number;
  previewDrafts: boolean;
  round: 1 | 2 | 3;
  hole: number;
  read: boolean;
  delivery: (typeof DELIVERY_STATES)[number][0];
};
export const DEFAULT_HIGHLIGHT_SIM: HighlightSim = {
  source: "engine", scenario: "hl001-3", tripType: "match+individual", teamCompetition: true, matchFormat: "singles", swapSides: false,
  subject: "jake", recipient: "cade", intensity: DEFAULT_PREFERENCES.golf as GolfIntensity, tripIntensity: "inherit", categoriesOff: [],
  variation: "random", seed: 1, previewDrafts: true, round: 2, hole: 7, read: false, delivery: "delivered",
};

/** Messages are untrusted (postMessage): anything off-spec is rejected. */
export function parseHighlightSim(value: unknown): HighlightSim | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const oneOf = (x: unknown, list: readonly unknown[]) => list.includes(x);
  const ok = oneOf(v.source, ["design", "engine"]) && typeof v.scenario === "string" && SCENARIOS.some((s) => s.id === v.scenario)
    && oneOf(v.tripType, TRIP_TYPES) && typeof v.teamCompetition === "boolean" && oneOf(v.matchFormat, ["singles", "fourball"]) && typeof v.swapSides === "boolean"
    && oneOf(v.subject, MEMBER_IDS) && oneOf(v.recipient, MEMBER_IDS) && oneOf(v.intensity, GOLF_INTENSITIES) && oneOf(v.tripIntensity, ["inherit", ...GOLF_INTENSITIES])
    && Array.isArray(v.categoriesOff) && v.categoriesOff.every((c) => oneOf(c, PREFERENCE_CATEGORIES)) && oneOf(v.variation, VARIATION_CHOICES)
    && Number.isSafeInteger(v.seed) && (v.seed as number) >= 0 && typeof v.previewDrafts === "boolean" && oneOf(v.round, [1, 2, 3])
    && Number.isInteger(v.hole) && (v.hole as number) >= 1 && (v.hole as number) <= 18 && typeof v.read === "boolean" && oneOf(v.delivery, DELIVERY_STATES.map(([id]) => id));
  return ok ? (value as HighlightSim) : null;
}

// --- Scenarios ------------------------------------------------------------------------------------------------------

type Built = { values: TemplateValues; tier?: number | string; itemId?: ItemId | null; confirmed?: boolean; selected?: string[] | null; round?: AudienceContext["round"]; sides?: { a: number; b: number } };
export interface Scenario { id: string; label: string; group: "Golf" | "Travel"; ruleId: string; build: (s: HighlightSim) => Built }

const roundValues = (s: HighlightSim) => ({ Round: String(s.round), Course: SIM_ROUNDS[s.round - 1].course, Hole: String(s.hole) });
const teamName = (team: string, s: HighlightSim) => (s.teamCompetition ? `Team ${team}` : null);
/** The match the subject is in: their tee group, their partner (fourball) vs the other team's players in that group. */
function sides(s: HighlightSim): [Side, Side] {
  const me = member(s.subject);
  const group = SIM_MEMBERS.filter((m) => m.group === me.group);
  const partner = group.find((m) => m.team === me.team && m.id !== me.id)!;
  const others = group.filter((m) => m.team !== me.team);
  const otherTeam = me.team === "Maroon" ? "White" : "Maroon";
  const a: Side = { team: teamName(me.team, s), players: s.matchFormat === "fourball" ? [first(me.id), first(partner.id)] : [first(me.id)] };
  const b: Side = { team: teamName(otherTeam, s), players: (s.matchFormat === "fourball" ? others : others.slice(0, 1)).map((m) => first(m.id)) };
  return s.swapSides ? [b, a] : [a, b];
}
const golf = (id: string, label: string, ruleId: string, build: Scenario["build"]): Scenario => ({ id, label, group: "Golf", ruleId, build });
const player = (s: HighlightSim) => ({ Player: first(s.subject), ...roundValues(s) });
const match = (s: HighlightSim, extra: TemplateValues = {}): Built => { const [a, b] = sides(s); return { values: { ...matchValues(a, b), ...roundValues(s), ...extra }, sides: { a: a.players.length, b: b.players.length } }; };
const roundPlayers = () => ({ players: [...MEMBER_IDS], teeGroup: [] as string[] });

export const SCENARIOS: Scenario[] = [
  golf("hl001-3", "Birdie streak · 3 in a row (HL-001)", "HL-001", (s) => ({ tier: 3, values: { ...player(s), Count: "3" } })),
  golf("hl001-5", "Birdie streak · 5 in a row (HL-001)", "HL-001", (s) => ({ tier: 5, values: { ...player(s), Count: "5" } })),
  golf("hl002", "Eagle (HL-002)", "HL-002", (s) => ({ values: player(s) })),
  golf("hl004", "Hole-in-one (HL-004)", "HL-004", (s) => ({ values: player(s) })),
  golf("hl012", "Match · 3 holes won in a row (HL-012)", "HL-012", (s) => ({ ...match(s), tier: s.matchFormat === "fourball" ? "Team of 2" : "Single" })),
  golf("hl013", "Match comeback (HL-013)", "HL-013", (s) => match(s, { Count: "3" })),
  golf("hl014", "Match lead change (HL-014)", "HL-014", (s) => match(s)),
  golf("hl019", "Match clinched · 3&2 (HL-019)", "HL-019", (s) => match(s, { Margin: "3&2" })),
  golf("hl031", "Leaderboard · new solo leader (HL-031)", "HL-031", (s) => ({ values: player(s) })),
  golf("hl033", "Leaderboard · breakaway by 3 (HL-033)", "HL-033", (s) => ({ values: { ...player(s), Count: "3" } })),
  golf("hl022", "Team takes the lead (HL-022)", "HL-022", (s) => {
    const mine = member(s.subject).team, other = mine === "Maroon" ? "White" : "Maroon";
    const [team, rival] = s.swapSides ? [other, mine] : [mine, other];
    return { values: teamValues(`Team ${team}`, `Team ${rival}`) };
  }),
  golf("hl040", "Tournament begins (HL-040)", "HL-040", () => ({ values: {} })),
  golf("hl049", "Shared birdies · same group (HL-049)", "HL-049", (s) => {
    const group = SIM_MEMBERS.filter((m) => m.group === member(s.subject).group).map((m) => m.id);
    const players = [s.subject, ...group.filter((id) => id !== s.subject)].slice(0, 3).map(first);
    return { values: { ...groupValues(players), Hole: String(s.hole) } };
  }),
  golf("hl053", "Shared birdies · different groups (HL-053)", "HL-053", (s) => {
    const other = SIM_MEMBERS.filter((m) => m.group !== member(s.subject).group).slice(0, 2).map((m) => m.id);
    return { values: { ...groupValues([s.subject, ...other].map(first)), Hole: String(s.hole) } };
  }),
];
const travel = (id: string, label: string, ruleId: string, itemId: ItemId | null, extra: Partial<Built> = {}): Scenario => ({
  id, label, group: "Travel", ruleId,
  build: () => ({ ...extra, itemId, values: { ...(itemId ? SIM_ITEMS[itemId].values : {}), ...(extra.values ?? {}) } }),
});
/** Round 2's first tee group (fixture): Cade, Cam, Collin, Mike. */
const TEE_GROUP_1 = SIM_MEMBERS.filter((m) => m.group === 1).map((m) => m.id);
SCENARIOS.push(
  travel("tr001", "Flight tomorrow (TR-001)", "TR-001", "flight"),
  travel("tr002", "Flight in 3 hours (TR-002)", "TR-002", "flight"),
  travel("tr003", "Flight details edited (TR-003)", "TR-003", "flight"),
  travel("tr004", "Flight delayed · confirmed by organizer (TR-004)", "TR-004", "flight", { confirmed: true, values: { "Flight Status": "Delayed 45 min" } }),
  travel("tr004-unconfirmed", "Flight delay · NOT confirmed (TR-004, refused)", "TR-004", "flight", { confirmed: false, values: { "Flight Status": "Delayed 45 min" } }),
  travel("tr005", "Airport pickup (TR-005)", "TR-005", "pickup"),
  travel("tr006", "Carpool leaving soon (TR-006)", "TR-006", "carpool"),
  travel("tr007", "Carpool changed (TR-007)", "TR-007", "carpool"),
  travel("tr008", "Rental car pickup (TR-008)", "TR-008", "rental"),
  travel("tr009", "Rental car return (TR-009)", "TR-009", "rentalReturn"),
  travel("tr010", "Shuttle pickup (TR-010)", "TR-010", "shuttle"),
  travel("tr011", "Golf round tomorrow (TR-011)", "TR-011", "teeTime", { round: { players: [...MEMBER_IDS], teeGroup: [] } }),
  travel("tr012", "Tee time in 60 min · tee group 1 only (TR-012)", "TR-012", "teeTime", { round: { players: [...MEMBER_IDS], teeGroup: TEE_GROUP_1 } }),
  travel("tr013", "Tee time changed (TR-013)", "TR-013", "teeTime", { round: roundPlayers() }),
  travel("tr014", "Pairings ready (TR-014)", "TR-014", "teeTime", { round: roundPlayers() }),
  travel("tr015", "Lodging check-in (TR-015)", "TR-015", "checkIn"),
  travel("tr016", "Lodging check-out · evening before (TR-016)", "TR-016", "checkOut"),
  travel("tr017", "Lodging instructions updated (TR-017)", "TR-017", "checkIn"),
  travel("tr018", "Dinner in 60 min (TR-018)", "TR-018", "dinner"),
  travel("tr019", "Activity changed (TR-019)", "TR-019", "activity"),
  travel("tr020", "Organizer announcement · everyone (TR-020)", "TR-020", null, { values: { Announcement: "Shuttle leaves at 7:15 sharp." }, selected: null }),
  travel("tr021", "Event cancelled (TR-021)", "TR-021", "dinner"),
  travel("tr022", "Trip starts tomorrow (TR-022)", "TR-022", "arrival"),
);

// --- Running a scenario through the engine ---------------------------------------------------------------------------

export interface SimulatedAlert {
  scenario: Scenario;
  event: AlertEvent;
  evaluation: Evaluation;
  /** Scheduled reminders: when it would go out (trip time), else null (sent when the event / edit happens). */
  sendAt: string | null;
  trigger: string;
  audienceNames: string[];
}

const hash = (text: string) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const fmtTripTime = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: SIM_TRIP.timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });

export function simulate(sim: HighlightSim, scenarioId = sim.scenario): SimulatedAlert {
  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];
  const built = scenario.build(sim);
  const item = built.itemId ? SIM_ITEMS[built.itemId] : null;
  const me = member(sim.subject);
  const audience: AudienceContext = {
    members: [...MEMBER_IDS],
    item: item ? { travelers: [...item.travelers], driver: "driver" in item ? (item as { driver?: string }).driver ?? null : null } : null,
    round: built.round ?? { players: [...MEMBER_IDS], teeGroup: TEE_GROUP_1 },
    selected: built.selected ?? null,
  };
  const event: AlertEvent = {
    tripId: SIM_TRIP.id, ruleId: scenario.ruleId, tier: built.tier ?? null, values: built.values, itemId: built.itemId ?? null,
    confirmed: built.confirmed, sides: built.sides ?? null, key: `${scenario.ruleId}:${built.itemId ?? me.id}:${sim.round}:${sim.hole}`,
  };
  const account = { golf: sim.intensity, categories: { ...DEFAULT_PREFERENCES.categories, ...Object.fromEntries(sim.categoriesOff.map((c) => [c, false])) } };
  const conditionalId = SNAPSHOT.config.rules.find((r) => r.id === scenario.ruleId)?.conditionals.find((c) => built.tier === undefined || String(c.tier) === String(built.tier))?.id;
  const evaluation = evaluateAlert(event, {
    config: SNAPSHOT.config, configVersion: null, competition: competitionProfile(setupFor(sim.tripType, sim.teamCompetition)), audience,
    recipientId: sim.recipient, preferences: effectivePreferences(account, sim.tripIntensity === "inherit" ? null : { golf: sim.tripIntensity }),
    previewDrafts: sim.previewDrafts, forcedVariation: sim.variation === "random" || !conditionalId ? null : `${conditionalId}-${sim.variation}`,
    random: seededRandom(sim.seed + hash(scenario.id)),
  });
  const rule = SNAPSHOT.config.rules.find((r) => r.id === scenario.ruleId);
  const profile = rule ? ruleProfile(rule) : null;
  const sendAt = profile?.trigger && item ? reminderSendAt(profile.trigger, item.startsAt, SIM_TRIP.timeZone) : null;
  const trigger = profile?.family === "travel" ? `${rule!.meta.reminderTrigger}${sendAt ? ` → sends ${fmtTripTime(sendAt)}` : " → sends when it happens"}` : "Detected from scores (live scoring, H5B)";
  const scope = profile?.family === "travel" ? profile.audience! : "trip-members";
  return { scenario, event, evaluation, sendAt, trigger, audienceNames: recipients(scope, audience).map((id) => member(id).name) };
}

const KIND: Record<PreferenceCategory, NotificationKind> = {
  "golf-performance": "highlight", "match-competition": "highlight", "individual-leaderboard": "highlight", "fun-social": "highlight",
  "trip-essentials": "travel", "flights-transportation": "travel", "group-announcements": "announcement",
};
/** The app's one notification shape (lib/notifications/types.ts), so the existing screens draw it unchanged. */
export function toAppNotification(result: SimulatedAlert, createdAt: string, read: boolean): AppNotification | null {
  const alert = result.evaluation.alert;
  if (!alert) return null;
  const golfSchedule = /^TR-01[1-4]$/.test(alert.ruleId);
  return {
    id: `${result.scenario.id}:${alert.variationId}`, kind: golfSchedule ? "teeTime" : KIND[alert.category], title: alert.title, body: alert.body,
    link: alert.link, groupId: SIM_TRIP.id, groupName: SIM_TRIP.name, createdAt, read,
  };
}

/**
 * The recipient's inbox: every scenario run through the engine with the same settings; only alerts that would be
 * delivered appear. The current scenario is newest (unless it's still scheduled or was withdrawn).
 */
export function simulatedInbox(sim: HighlightSim, now: Date): AppNotification[] {
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60000).toISOString();
  const others = SCENARIOS.filter((s) => s.id !== sim.scenario && s.id !== "tr004-unconfirmed");
  const list: AppNotification[] = [];
  if (sim.delivery === "delivered") {
    const current = simulate(sim);
    const note = current.evaluation.outcome === "delivered" ? toAppNotification(current, minutesAgo(0), sim.read) : null;
    if (note) list.push(note);
  }
  others.forEach((scenario, index) => {
    const result = simulate(sim, scenario.id);
    const note = result.evaluation.outcome === "delivered" ? toAppNotification(result, minutesAgo(9 + index * 23), index > 2) : null;
    if (note) list.push(note);
  });
  return list;
}

/**
 * What the existing preview screens draw in engine mode. `current` is the scenario's alert on the phone (null when it
 * wasn't delivered, or is still scheduled; a withdrawn alert stays on the phone — a delivered push can't be recalled —
 * but leaves the inbox). `inbox` is the bell list.
 */
export function previewNotes(sim: HighlightSim, now: Date): { current: AppNotification | null; inbox: AppNotification[] } {
  const result = simulate(sim);
  const current = sim.delivery !== "scheduled" && result.evaluation.outcome === "delivered" ? toAppNotification(result, now.toISOString(), sim.read) : null;
  return { current, inbox: simulatedInbox(sim, now) };
}
