import { test } from "node:test";
import assert from "node:assert/strict";
import type { Tournament } from "../data/types";
import type { ProfileHistoryRound } from "../platform/playerRoundsRows";
import { legacyMaroonYears } from "./myProfile";
import {
  assembleProfileReadModel, splitTrips, teamHistory, type LegacyMaroonProfile, type ProfileSources, type ProfileSubjectRow, type ProfileTournamentEdition,
} from "./profileReadModel";

const ME = "6f1c2a52-8a3e-4c4e-9d55-0d3c8a1b2c3d";
const OTHER = "7f1c2a52-8a3e-4c4e-9d55-0d3c8a1b2c3d";
const TRIP_A = "8f1c2a52-8a3e-4c4e-9d55-0d3c8a1b2c3d";
const TRIP_B = "9f1c2a52-8a3e-4c4e-9d55-0d3c8a1b2c3d";
const TODAY = "2027-06-01";

const row = (extra: Partial<ProfileSubjectRow> = {}): ProfileSubjectRow =>
  ({ id: ME, displayName: "Sam Fresh", username: "samfresh", createdAt: "2027-01-05T10:00:00Z", legacyMaroonPlayerSlug: null, roundsVisibility: "private", ...extra });
const round = (source: ProfileHistoryRound["source"], id: string): ProfileHistoryRound => ({
  id, source, datePlayed: "2027-05-01", course: { ref: null, name: "Canyon Ridge", place: "" }, tee: null, holesPlayed: 18, format: "Stroke Play",
  holes: [], total: 88, countsForHandicap: false, notCountedReason: "No course rating for this tee", differential: null, enteredBy: "player", status: "submitted",
});
const LEGACY: LegacyMaroonProfile = {
  playerSlug: "cade-barone", fullName: "Cade Barone", avatarSrc: "/players/cade.jpg", bio: { id: "cade-barone", slug: "cade-barone", fullName: "Cade Barone", avatarSrc: null, bio: "Lefty.", history: [] },
  years: [{ year: 2026, team: "maroon", destination: "Palm Springs", href: "/leaderboard/2026" }, { year: 2025, team: "white", destination: null, href: "/leaderboard/2025" }],
  handicap: null, latestScorecard: null,
};

/** Fake sources that record every call. */
function sources(over: Partial<ProfileSources> = {}, subject = row()) {
  const calls = { history: 0, rounds: 0, legacy: [] as string[] };
  const s: ProfileSources = {
    subject: async (id) => id === subject.id ? subject : null,
    history: async () => { calls.history++; return { restricted: false, trips: [], tournaments: [] }; },
    rounds: async () => { calls.rounds++; return []; },
    legacy: async (slug) => { calls.legacy.push(slug); return LEGACY; },
    isLegacyTournament: (slug) => slug === "legacy-cup",
    ...over,
  };
  return { s, calls };
}

test("a brand-new golfer (no Maroon slug, no rounds, trips or tournaments) gets a whole profile and no legacy lookups", async () => {
  const { s, calls } = sources();
  const p = await assembleProfileReadModel(ME, ME, s, TODAY);
  assert.ok(p);
  assert.deepEqual(p.identity, { displayName: "Sam Fresh", username: "samfresh", initials: "SF", memberSince: "Jan 5, 2027", avatarSrc: null, bio: null, canEditBio: false, roundsVisibility: "private" });
  assert.deepEqual([p.rounds, p.trips, p.tournaments], [{ status: "ok", value: [] }, { status: "ok", value: { current: [], past: [] } }, { status: "ok", value: [] }]);
  assert.deepEqual(p.teamHistory, []);
  assert.equal(p.legacy, null);
  assert.deepEqual(calls.legacy, [], "no legacy lookups for a normal user");
});

test("trips and tournaments come through the read model: trips split current / past, legacy-served tournament rows left to the legacy section", async () => {
  const { s } = sources({
    history: async () => ({ restricted: false,
      trips: [{ id: TRIP_A, name: "Pinehurst", destination: "Pinehurst, NC", startDate: "2027-04-22", endDate: "2027-04-26", role: "member", playerCount: 6 },
        { id: TRIP_B, name: "Bandon", destination: null, startDate: "2027-09-10", endDate: null, role: "organizer", playerCount: 4 }, { id: "not-a-uuid", name: "Bad" }],
      tournaments: [{ slug: "texas-cup", name: "Texas Cup", year: 2028, label: "2028", team: { name: "Gold", color: "#ccaa00" }, isCaptain: false },
        { slug: "texas-cup", name: "Texas Cup", year: 2027, label: "2027", team: { name: "Blue", color: "#0033aa" }, isCaptain: true },
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

test("modern rounds from every source come straight from the canonical reader", async () => {
  const rounds = [round("personal", "personal:1"), round("trip", "trip:a:b"), round("tournament", "tournament:c:d"), round("history", "history:h:r")];
  const { s } = sources({ rounds: async () => rounds });
  const p = (await assembleProfileReadModel(ME, ME, s, TODAY))!;
  assert.deepEqual(p.rounds.status === "ok" && p.rounds.value.map((r) => r.source), ["personal", "trip", "tournament", "history"]);
});

test("a legacy Maroon player still gets their old data, kept in its own section and never as the identity", async () => {
  const { s, calls } = sources({}, row({ legacyMaroonPlayerSlug: "cade-barone", displayName: "cade" }));
  const p = (await assembleProfileReadModel(ME, ME, s, TODAY))!;
  assert.deepEqual(calls.legacy, ["cade-barone"]);
  assert.equal(p.legacy?.playerSlug, "cade-barone");
  assert.equal(p.identity.displayName, "Cade Barone");
  assert.equal(p.identity.bio, "Lefty.");
  assert.equal(p.identity.canEditBio, true);
  assert.deepEqual(p.teamHistory.map((e) => [e.year, e.team, e.source]), [[2026, "Team Maroon", "legacy"], [2025, "Team White", "legacy"]]);
  // A legacy read failing doesn't take the profile down.
  const broken = sources({ legacy: async () => { throw new Error("archive offline"); } }, row({ legacyMaroonPlayerSlug: "cade-barone" }));
  const q = (await assembleProfileReadModel(ME, ME, broken.s, TODAY))!;
  assert.equal(q.legacy, null);
  assert.equal(q.identity.displayName, "Sam Fresh");
});

test("viewer and subject are separate: another viewer gets no history, no legacy lookups, and only privacy-filtered rounds", async () => {
  const { s, calls } = sources({}, row({ legacyMaroonPlayerSlug: "cade-barone" }));
  const p = (await assembleProfileReadModel(OTHER, ME, s, TODAY))!;
  assert.equal(p.isOwner, false);
  assert.deepEqual([p.trips, p.tournaments], [{ status: "hidden" }, { status: "hidden" }]);
  assert.equal(calls.history, 0);
  assert.deepEqual(calls.legacy, []);
  assert.equal(calls.rounds, 1, "rounds still asked for — list_profile_rounds applies the privacy rules");
  assert.equal(p.identity.canEditBio, false);
  assert.equal(await assembleProfileReadModel(ME, OTHER, s, TODAY), null, "no such profile");
});

test("sources that can't be read leave their section unavailable; the payload never carries emails or internal ids", async () => {
  const { s } = sources({ history: async () => null, rounds: async () => { throw new Error("not installed"); } });
  const p = (await assembleProfileReadModel(ME, ME, s, TODAY))!;
  assert.deepEqual([p.rounds, p.trips, p.tournaments], [{ status: "unavailable" }, { status: "unavailable" }, { status: "unavailable" }]);
  const full = sources({ history: async () => ({ restricted: false,
    trips: [{ id: TRIP_A, name: "Pinehurst", startDate: "2027-04-22", endDate: "2027-04-26", role: "member", playerCount: 6, email: "x@y.z", profileId: OTHER }],
    tournaments: [{ slug: "texas-cup", name: "Texas Cup", year: 2027, label: "2027", team: null, isCaptain: false, profileId: OTHER, playerId: TRIP_B }] }) });
  const shown = JSON.stringify(await assembleProfileReadModel(ME, ME, full.s, TODAY));
  for (const secret of ["@", ME, OTHER, TRIP_B, "email", "profileId", "playerId"]) assert.equal(shown.includes(secret), false, `leaked ${secret}`);
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
