import { test } from "node:test";
import assert from "node:assert/strict";
import type { Tournament } from "../data/types";
import type { ProfileHistoryRound } from "../platform/playerRoundsRows";
import { legacyMaroonYears } from "./myProfile";
import {
  assembleProfileReadModel, modernStats, splitTrips, teamHistory, type LegacyMaroonProfile, type ProfileSources, type ProfileSubjectRow, type ProfileTournamentEdition,
} from "./profileReadModel";

const ME = "6f1c2a52-8a3e-4c4e-9d55-0d3c8a1b2c3d";
const OTHER = "7f1c2a52-8a3e-4c4e-9d55-0d3c8a1b2c3d";
const TRIP_A = "8f1c2a52-8a3e-4c4e-9d55-0d3c8a1b2c3d";
const TRIP_B = "9f1c2a52-8a3e-4c4e-9d55-0d3c8a1b2c3d";
const TODAY = "2027-06-01";

const row = (extra: Partial<ProfileSubjectRow> = {}): ProfileSubjectRow =>
  ({ id: ME, displayName: "Sam Fresh", username: "samfresh", createdAt: "2027-01-05T10:00:00Z", legacyMaroonPlayerSlug: null, roundsVisibility: "private", bio: null, ...extra });
const round = (source: ProfileHistoryRound["source"], id: string, extra: Partial<ProfileHistoryRound> = {}): ProfileHistoryRound => ({
  id, source, datePlayed: "2027-05-01", course: { ref: null, name: "Canyon Ridge", place: "" }, tee: null, holesPlayed: 18, format: "Stroke Play",
  holes: [], total: 88, countsForHandicap: false, notCountedReason: "No course rating for this tee", differential: null, enteredBy: "player", status: "submitted", ...extra,
});
const LEGACY: LegacyMaroonProfile = {
  playerSlug: "cade-barone",
  years: [{ year: 2026, team: "maroon", destination: "Palm Springs", href: "/leaderboard/2026" }, { year: 2025, team: "white", destination: null, href: "/leaderboard/2025" }],
  handicap: null, latestScorecard: null,
};
const HISTORY = { restricted: false,
  trips: [{ id: TRIP_A, name: "Pinehurst", destination: "Pinehurst, NC", startDate: "2027-04-22", endDate: "2027-04-26", role: "member", playerCount: 6 }],
  tournaments: [{ slug: "texas-cup", name: "Texas Cup", year: 2027, label: "2027", team: { name: "Blue", color: "#0033aa" }, isCaptain: true }] };

/** Fake sources that record every call. */
function sources(over: Partial<ProfileSources> = {}, subject = row()) {
  const calls = { history: 0, rounds: 0, legacy: [] as string[] };
  const s: ProfileSources = {
    subject: async (id) => id === subject.id ? subject : null,
    history: async () => { calls.history++; return { restricted: false, trips: [], tournaments: [] }; },
    rounds: async () => { calls.rounds++; return []; },
    legacy: async (slug, detail) => { calls.legacy.push(`${slug}:${detail}`); return detail === "full" ? LEGACY : { ...LEGACY, handicap: null, latestScorecard: null }; },
    isLegacyTournament: (slug) => slug === "legacy-cup",
    ...over,
  };
  return { s, calls };
}

test("a brand-new golfer (no Maroon slug, no rounds, trips or tournaments) gets a whole profile they can edit, and no legacy lookups", async () => {
  const { s, calls } = sources();
  const p = await assembleProfileReadModel(ME, ME, s, TODAY);
  assert.ok(p);
  assert.equal(p.access, "owner");
  assert.deepEqual(p.identity, { displayName: "Sam Fresh", username: "samfresh", initials: "SF", memberSince: "Jan 5, 2027", avatarSrc: null, bio: null, canEditBio: true, roundsVisibility: "private" });
  assert.deepEqual([p.rounds, p.trips, p.tournaments], [{ status: "ok", value: [] }, { status: "ok", value: { current: [], past: [] } }, { status: "ok", value: [] }]);
  assert.deepEqual([p.teamHistory, p.modernStats, p.legacy], [[], null, null]);
  assert.deepEqual(calls.legacy, [], "no legacy lookups for a normal user");
});

test("the modern bio is the source of truth for everyone, no Maroon slug needed", async () => {
  const p = (await assembleProfileReadModel(ME, ME, sources({}, row({ bio: "Weekend hacker." })).s, TODAY))!;
  assert.equal(p.identity.bio, "Weekend hacker.");
});

test("trips and tournaments come through the read model: trips split current / past, legacy-served tournament rows left to the legacy section", async () => {
  const { s } = sources({
    history: async () => ({ restricted: false,
      trips: [...HISTORY.trips, { id: TRIP_B, name: "Bandon", destination: null, startDate: "2027-09-10", endDate: null, role: "organizer", playerCount: 4 }, { id: "not-a-uuid", name: "Bad" }],
      tournaments: [{ slug: "texas-cup", name: "Texas Cup", year: 2028, label: "2028", team: { name: "Gold", color: "#ccaa00" }, isCaptain: false }, ...HISTORY.tournaments,
        { slug: "legacy-cup", name: "Legacy Cup", year: 2027, label: "2027", team: null, isCaptain: false }] }),
  });
  const p = (await assembleProfileReadModel(ME, ME, s, TODAY))!;
  assert.equal(p.trips.status, "ok");
  if (p.trips.status !== "ok" || p.tournaments.status !== "ok") return;
  assert.deepEqual(p.trips.value.current.map((t) => [t.name, t.role, t.href]), [["Bandon", "organizer", `/golf-trips/${TRIP_B}`]]);
  assert.deepEqual(p.trips.value.past.map((t) => t.name), ["Pinehurst"]);
  assert.deepEqual(p.tournaments.value.map((t) => [t.year, t.team?.name, t.isCaptain, t.href]), [[2028, "Gold", false, "/play/texas-cup/2028"], [2027, "Blue", true, "/play/texas-cup/2027"]]);
  // Same tournament, different team each year — from the editions, never from the profile.
  assert.deepEqual(p.teamHistory.map((e) => `${e.year} ${e.tournament} — ${e.team}${e.isCaptain ? " (C)" : ""}`), ["2028 Texas Cup — Gold", "2027 Texas Cup — Blue (C)"]);
  assert.equal("team" in p.identity, false);
});

test("modern rounds from every source come straight from the canonical reader, and feed honest stats", async () => {
  const rounds = [
    round("personal", "personal:1", { total: 84, countsForHandicap: true, differential: 12, notCountedReason: null }),
    round("trip", "trip:a:b", { total: 90, countsForHandicap: true, differential: 17, notCountedReason: null, datePlayed: "2027-04-23" }),
    round("tournament", "tournament:c:d", { total: 86, countsForHandicap: true, differential: 14, notCountedReason: null, datePlayed: "2027-03-01" }),
    round("history", "history:h:r", { holesPlayed: 9, total: 45 }),
  ];
  const p = (await assembleProfileReadModel(ME, ME, sources({ rounds: async () => rounds }).s, TODAY))!;
  assert.deepEqual(p.rounds.status === "ok" && p.rounds.value.map((r) => r.source), ["personal", "trip", "tournament", "history"]);
  assert.deepEqual(p.modernStats, { roundsPlayed: 4, eighteenHoleRounds: 3, average18: 86.7, best18: 84, handicapIndex: 10, countingRounds: 3 });
  assert.equal(modernStats([]), null, "no rounds = no stats (the Stats tab shows its empty state)");
  assert.equal(modernStats([round("trip", "x")])?.handicapIndex, null, "no index until 3 rounds count");
});

test("a legacy Maroon player looks like a normal profile: no old name, bio or photo — only their historical golf data", async () => {
  // Never changed signup's placeholder name and no modern bio: that's what shows (the old Maroon text is retired).
  const { s, calls } = sources({}, row({ legacyMaroonPlayerSlug: "cade-barone", displayName: "Golfer" }));
  const p = (await assembleProfileReadModel(ME, ME, s, TODAY))!;
  assert.deepEqual(calls.legacy, ["cade-barone:full"]);
  assert.deepEqual([p.identity.displayName, p.identity.bio, p.identity.avatarSrc, p.identity.canEditBio], ["Golfer", null, null, true]);
  assert.deepEqual(Object.keys(p.legacy ?? {}).sort(), ["handicap", "latestScorecard", "playerSlug", "years"], "golf history only");
  // Archive years keep that year's team, as edition context — never a profile team.
  assert.deepEqual(p.teamHistory.map((e) => [e.year, e.team, e.source]), [[2026, "Team Maroon", "legacy"], [2025, "Team White", "legacy"]]);
  // What they set themselves is the profile.
  const modern = (await assembleProfileReadModel(ME, ME, sources({}, row({ legacyMaroonPlayerSlug: "cade-barone", displayName: "Cade B", bio: "New bio." })).s, TODAY))!;
  assert.deepEqual([modern.identity.displayName, modern.identity.bio], ["Cade B", "New bio."]);
  // A legacy read failing doesn't take the profile down.
  const broken = sources({ legacy: async () => { throw new Error("archive offline"); } }, row({ legacyMaroonPlayerSlug: "cade-barone" }));
  const q = (await assembleProfileReadModel(ME, ME, broken.s, TODAY))!;
  assert.deepEqual([q.legacy, q.identity.displayName], [null, "Sam Fresh"]);
});

test("someone else, Private profile: name and username only — and nothing else is even looked up", async () => {
  const { s, calls } = sources({ history: async () => { calls.history++; return HISTORY; } }, row({ legacyMaroonPlayerSlug: "cade-barone", bio: "Secret bio." }));
  for (const viewer of [OTHER, null]) {
    const p = (await assembleProfileReadModel(viewer, ME, s, TODAY))!;
    assert.deepEqual([p.isOwner, p.access], [false, "private"]);
    assert.deepEqual(p.identity, { displayName: "Sam Fresh", username: "samfresh", initials: "SF", memberSince: null, avatarSrc: null, bio: null, canEditBio: false, roundsVisibility: "private" });
    assert.deepEqual([p.rounds, p.trips, p.tournaments], [{ status: "hidden" }, { status: "hidden" }, { status: "hidden" }]);
    assert.deepEqual([p.teamHistory, p.modernStats, p.legacy], [[], null, null]);
  }
  assert.deepEqual([calls.history, calls.rounds, calls.legacy], [0, 0, []]);
  assert.equal(await assembleProfileReadModel(ME, OTHER, s, TODAY), null, "no such profile");
});

test("someone else, Public profile: identity, modern bio, rounds and public tournaments — never golf trips, never the legacy handicap", async () => {
  const { s, calls } = sources({ history: async () => { calls.history++; return HISTORY; }, rounds: async () => [round("trip", "trip:a:b")] },
    row({ roundsVisibility: "public", legacyMaroonPlayerSlug: "cade-barone", bio: "Hi." }));
  const p = (await assembleProfileReadModel(OTHER, ME, s, TODAY))!;
  assert.deepEqual([p.isOwner, p.access, p.identity.canEditBio, p.identity.bio, p.identity.memberSince], [false, "public", false, "Hi.", "Jan 5, 2027"]);
  assert.deepEqual(p.trips, { status: "hidden" }, "trips are the owner's only, even if the database sent some");
  assert.deepEqual(p.tournaments.status === "ok" && p.tournaments.value.map((t) => t.name), ["Texas Cup"]);
  assert.equal(p.rounds.status === "ok" && p.rounds.value.length, 1);
  assert.deepEqual(calls.legacy, ["cade-barone:public"], "the public legacy detail: no handicap history or scorecard");
});

test("sources that can't be read leave their section unavailable; the payload never carries emails or internal ids", async () => {
  const { s } = sources({ history: async () => null, rounds: async () => { throw new Error("not installed"); } });
  const p = (await assembleProfileReadModel(ME, ME, s, TODAY))!;
  assert.deepEqual([p.rounds, p.trips, p.tournaments], [{ status: "unavailable" }, { status: "unavailable" }, { status: "unavailable" }]);
  const full = sources({ history: async () => ({ restricted: false,
    trips: [{ id: TRIP_A, name: "Pinehurst", startDate: "2027-04-22", endDate: "2027-04-26", role: "member", playerCount: 6, email: "x@y.z", profileId: OTHER }],
    tournaments: [{ slug: "texas-cup", name: "Texas Cup", year: 2027, label: "2027", team: null, isCaptain: false, profileId: OTHER, playerId: TRIP_B }] }) });
  for (const viewer of [ME, OTHER]) {
    const shown = JSON.stringify(await assembleProfileReadModel(viewer, ME, full.s, TODAY));
    for (const secret of ["@", ME, OTHER, TRIP_B, "email", "profileId", "playerId"]) assert.equal(shown.includes(secret), false, `leaked ${secret}`);
  }
});

test("trip split, team history and legacy years are plain rules", () => {
  const trip = (name: string, startDate: string | null, endDate: string | null) => ({ name, destination: null, startDate, endDate, role: "member" as const, playerCount: 1, href: `/golf-trips/${name}` });
  const split = splitTrips([trip("old", "2026-04-01", "2026-04-04"), trip("now", "2027-05-30", "2027-06-02"), trip("undated", null, null), trip("today-ends", "2027-05-28", TODAY)], TODAY);
  assert.deepEqual(split.current.map((t) => t.name), ["today-ends", "now", "undated"]);
  assert.deepEqual(split.past.map((t) => t.name), ["old"]);
  const ed = (year: number, team: string | null): ProfileTournamentEdition => ({ name: "Cup", year, label: String(year), destination: null, startDate: null, endDate: null, team: team ? { name: team, color: "#000000" } : null, isCaptain: false, href: "" });
  assert.deepEqual(teamHistory([ed(2027, "Blue"), ed(2028, null)], []).map((e) => e.team), ["Blue"], "an individual year has no team row");
  const fixture = [{ slug: "2024-a", year: 2024, location: "A", roster: { maroon: ["cam-latto"], white: ["cade-barone"] } }, { slug: "2025-b", year: 2025, location: "", roster: { maroon: ["cade-barone"], white: [] } }] as unknown as Tournament[];
  assert.deepEqual(legacyMaroonYears("cade-barone", fixture), [{ year: 2025, team: "maroon", destination: null, href: "/leaderboard/2025-b" }, { year: 2024, team: "white", destination: "A", href: "/leaderboard/2024-a" }]);
  assert.deepEqual(legacyMaroonYears("nobody", fixture), []);
});
