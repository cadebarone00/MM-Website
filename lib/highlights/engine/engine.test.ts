import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEligibility, type Eligibility } from "../metadata.ts";
import { recipients } from "./audience.ts";
import { competitionProfile, eligibleForTrip, setupFor } from "./competition.ts";
import { applyVolumeCap, localToUtc, reconcile, reminderSendAt, rescheduleReminders, isDuplicate } from "./delivery.ts";
import { DEFAULT_PREFERENCES, effectivePreferences, intensityIncludes } from "./preferences.ts";
import { pickVariation, seededRandom } from "./selection.ts";
import { formatList, groupValues, matchValues, teamValues } from "./values.ts";
import type { HighlightVariation } from "../types.ts";

const elig = (text: string) => (parseEligibility(text) as { value: Eligibility }).value;

test("competition comes from the real setup: formats and match type, not a label", () => {
  assert.equal(competitionProfile({ individual: "Stroke Play", team: "2 Teams" }).tripType, "match+individual");
  assert.equal(competitionProfile({ individual: null, team: "Pairs" }).tripType, "match-only");
  assert.equal(competitionProfile({ individual: "Points Based", team: null }).tripType, "individual-only");
  assert.equal(competitionProfile({ individual: null, team: null }).tripType, "noncompetitive");
  // A team format played as Stroke Play has no matches.
  assert.deepEqual(competitionProfile({ individual: null, team: "4-Ball", roundMatchType: "Stroke Play" }), { individual: false, match: false, teamCompetition: false, tournament: false, tripType: "noncompetitive" });
  assert.equal(competitionProfile({ individual: null, team: "Pairs" }).teamCompetition, false, "pairs matches without a team cup");
  assert.equal(competitionProfile(setupFor("match-only", true)).teamCompetition, true);
});

test("eligibility: match / team / leaderboard results never reach a trip that doesn't have them", () => {
  const none = competitionProfile(setupFor("noncompetitive", false));
  const individual = competitionProfile(setupFor("individual-only", false));
  const matchNoTeam = competitionProfile(setupFor("match-only", false));
  const both = competitionProfile(setupFor("match+individual", true));
  const matchRule = elig("Match + Individual; Match Only"), teamRule = elig("Match + Individual; Match Only (team competition active)");
  const leaderboard = elig("Match + Individual; Individual Only"), milestone = elig("Match + Individual; Match Only; Individual Only (tournament configured)");
  const anyone = elig("All trip types");
  assert.deepEqual([none, individual, matchNoTeam, both].map((p) => eligibleForTrip(matchRule, p).ok), [false, false, true, true]);
  assert.deepEqual([none, individual, matchNoTeam, both].map((p) => eligibleForTrip(teamRule, p).ok), [false, false, false, true]);
  assert.deepEqual([none, individual, matchNoTeam, both].map((p) => eligibleForTrip(leaderboard, p).ok), [false, true, false, true]);
  assert.deepEqual([none, individual, matchNoTeam, both].map((p) => eligibleForTrip(milestone, p).ok), [false, true, true, true]);
  assert.deepEqual([none, individual, matchNoTeam, both].map((p) => eligibleForTrip(anyone, p).ok), [true, true, true, true]);
  assert.match(eligibleForTrip(teamRule, matchNoTeam).reason, /team competition/);
});

test("golf intensity is a ranking: Big Plays ⊂ Balanced ⊂ All; Off gets nothing", () => {
  const table = (["off", "big-plays", "balanced", "all"] as const).map((setting) => (["big-plays", "balanced", "all"] as const).map((rule) => intensityIncludes(setting, rule)));
  assert.deepEqual(table, [[false, false, false], [true, false, false], [true, true, false], [true, true, true]]);
});

test("preferences: account level with per-trip overrides; defaults are Balanced with every category on", () => {
  assert.equal(DEFAULT_PREFERENCES.golf, "balanced");
  assert.ok(Object.values(DEFAULT_PREFERENCES.categories).every(Boolean));
  const account = { golf: "all" as const, categories: { ...DEFAULT_PREFERENCES.categories, "fun-social": false } };
  assert.deepEqual(effectivePreferences(account, null), account);
  const trip = effectivePreferences(account, { golf: "big-plays", categories: { "fun-social": true, "flights-transportation": false } });
  assert.deepEqual([trip.golf, trip.categories["fun-social"], trip.categories["flights-transportation"], trip.categories["golf-performance"]], ["big-plays", true, false, true]);
  assert.equal(account.categories["flights-transportation"], true, "an override never changes the account settings");
});

test("placeholder values keep every golfer on their own side; lists read naturally", () => {
  assert.deepEqual([formatList(["Cam"]), formatList(["Cam", "Cade"]), formatList(["Cam", "Drew", "Cade"])], ["Cam", "Cam and Cade", "Cam, Drew, and Cade"]);
  const fourball = matchValues({ team: "Team Maroon", players: ["Cade", "Cam"] }, { team: "Team White", players: ["Collin", "Mike"] });
  assert.deepEqual(fourball, { Player: "Cade & Cam", Opponent: "Team White", "Player 1, Team A": "Cade", "Player 2, Team A": "Cam", "Player 1, Team B": "Collin", "Player 2, Team B": "Mike", Team: "Team Maroon", "Team A": "Team Maroon", "Team B": "Team White" });
  const singlesNoTeams = matchValues({ team: null, players: ["Cade"] }, { team: null, players: ["Collin"] });
  assert.deepEqual(singlesNoTeams, { Player: "Cade", Opponent: "Collin", "Player 1, Team A": "Cade", "Player 1, Team B": "Collin" });
  assert.deepEqual(groupValues(["Cam", "Drew", "Cade"]), { Players: "Cam, Drew, and Cade", "Player 1": "Cam", "Player 2": "Drew", "Player 3": "Cade" });
  assert.equal(groupValues(["Cam", "Drew"])["Player 3"], undefined, "a wording that needs a third golfer can't be filled by two");
  assert.deepEqual(teamValues("Team White", "Team Maroon"), { Team: "Team White", "Team A": "Team White", "Team B": "Team Maroon", Opponent: "Team Maroon" });
});

test("variation pick: random among usable wordings, never one of the ⌊n/2⌋ most recent; n = 1 always that one", () => {
  const v = (id: string) => ({ id } as HighlightVariation);
  const three = [v("V01"), v("V02"), v("V03")];
  for (let seed = 0; seed < 50; seed++) assert.notEqual(pickVariation(three, { recent: ["V02"], random: seededRandom(seed) }).variation!.id, "V02");
  const seen = new Set(Array.from({ length: 60 }, (_, seed) => pickVariation(three, { recent: [], random: seededRandom(seed) }).variation!.id));
  assert.equal(seen.size, 3, "all three get picked");
  assert.equal(pickVariation([v("V01"), v("V02")], { recent: ["V01"], random: () => 0 }).variation!.id, "V02", "two alternate");
  assert.equal(pickVariation([v("V01")], { recent: ["V01"], random: () => 0.9 }).variation!.id, "V01");
  assert.equal(pickVariation(three, { recent: [], random: () => 0, forced: "V03" }).variation!.id, "V03");
  assert.equal(pickVariation([], { recent: [], random: Math.random }).variation, null);
  assert.deepEqual(pickVariation(three, { recent: ["V09", "V03"], random: () => 0 }).excluded, ["V03"], "IDs no longer usable are ignored");
});

test("audiences resolve against the itinerary; only trip members, no duplicates", () => {
  const ctx = { members: ["a", "b", "c", "d"], item: { travelers: ["a", "b", "z"], driver: "c" }, round: { players: ["a", "b", "c", "d"], teeGroup: ["a", "d"] }, selected: ["d"] };
  assert.deepEqual(recipients("item-travelers", ctx), ["a", "b"]);
  assert.deepEqual(recipients("transport-group", ctx), ["a", "b", "c"]);
  assert.deepEqual(recipients("tee-group", ctx), ["a", "d"]);
  assert.deepEqual(recipients("selected", ctx), ["d"]);
  assert.deepEqual(recipients("selected", { ...ctx, selected: null }), ["a", "b", "c", "d"], "no selection = everyone");
  assert.deepEqual(recipients("trip-members", ctx), ["a", "b", "c", "d"]);
});

test("reminders: trip-local times, daylight saving, evening-before; edits reschedule, cancellations cancel", () => {
  assert.equal(localToUtc("2026-10-16T14:10", "America/Los_Angeles"), "2026-10-16T21:10:00.000Z"); // PDT, UTC-7
  assert.equal(localToUtc("2026-12-16T14:10", "America/Los_Angeles"), "2026-12-16T22:10:00.000Z"); // PST, UTC-8
  assert.equal(localToUtc("2026-11-01T09:00", "America/New_York"), "2026-11-01T14:00:00.000Z"); // the day DST ends
  assert.equal(reminderSendAt({ type: "before", minutes: 60 }, "2026-10-16T14:10", "America/Los_Angeles"), "2026-10-16T20:10:00.000Z");
  // "24h before" is 24 elapsed hours: an 8:00 AM PST round right after the change gets its reminder at 9:00 AM PDT the day before.
  assert.equal(reminderSendAt({ type: "before", minutes: 1440 }, "2026-11-01T08:00", "America/Los_Angeles"), "2026-10-31T16:00:00.000Z", "24h before across the DST change");
  assert.equal(reminderSendAt({ type: "evening-before", localTime: "19:00" }, "2026-10-18T11:00", "America/Los_Angeles"), "2026-10-18T02:00:00.000Z");
  assert.equal(reminderSendAt({ type: "event", event: "edit" }, "2026-10-18T11:00", "America/Los_Angeles"), null);
  const moved = rescheduleReminders(["TR-012"], { id: "t1", startsAt: "2026-10-16T14:10" }, { id: "t1", startsAt: "2026-10-16T14:40" });
  assert.deepEqual(moved, { cancel: ["TR-012:t1:2026-10-16T14:10"], schedule: ["TR-012:t1:2026-10-16T14:40"] });
  assert.deepEqual(rescheduleReminders(["TR-012"], { id: "t1", startsAt: "2026-10-16T14:10" }, { id: "t1", startsAt: "2026-10-16T14:10" }), { cancel: [], schedule: [] }, "unchanged → nothing redundant");
  assert.deepEqual(rescheduleReminders(["TR-012"], { id: "t1", startsAt: "2026-10-16T14:10" }, { id: "t1", startsAt: "2026-10-16T14:10", cancelled: true }).schedule, []);
});

test("idempotency, score corrections and volume control", () => {
  const delivered = new Set(["HL-001:jake:r2:h7:cade"]);
  assert.equal(isDuplicate("HL-001:jake:r2:h7", "cade", delivered), true);
  assert.equal(isDuplicate("HL-001:jake:r2:h7", "cam", delivered), false);
  assert.deepEqual(reconcile(["a", "b"], ["b", "c"]), { withdraw: ["a"], add: ["c"], keep: ["b"] }, "a corrected score withdraws 'a' and adds 'c'");
  const at = (m: number) => new Date(Date.UTC(2026, 9, 16, 21, m)).toISOString();
  const capped = applyVolumeCap([
    { key: "all-1", level: "all", at: at(0) }, { key: "bal-1", level: "balanced", at: at(1) }, { key: "big-1", level: "big-plays", at: at(2) },
    { key: "bal-2", level: "balanced", at: at(3) }, { key: "late", level: "all", at: at(40) },
  ], { maxPerWindow: 3, windowMinutes: 15, exceptional: "prioritize" });
  assert.deepEqual(capped, { send: ["bal-1", "big-1", "bal-2", "late"], muted: ["all-1"] }, "the smallest moment in a burst is the one muted");
  // Default: Big Plays always go out and don't use up the limit.
  const burst = [0, 1, 2, 3].map((m) => ({ key: `bal-${m}`, level: "balanced" as const, at: at(m) }));
  const ace = { key: "ace", level: "big-plays" as const, at: at(4) };
  assert.deepEqual(applyVolumeCap([...burst, ace]), { send: ["bal-0", "bal-1", "bal-2", "ace"], muted: ["bal-3"] });
  assert.deepEqual(applyVolumeCap([...burst, ace], { maxPerWindow: 2, windowMinutes: 15, exceptional: "prioritize" }).send, ["bal-0", "ace"], "prioritize: the ace takes a slot first");
  assert.deepEqual(applyVolumeCap([...burst, ace], { maxPerWindow: 0, windowMinutes: 15, exceptional: "prioritize" }).muted, [], "0 = no limit");
});
