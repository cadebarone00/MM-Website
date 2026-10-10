import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { golfTripPayloadFromBody, type CreateGolfTripPayload } from "../platform/golfTripCreate.ts";
import { createTournament, database, load, profile, quick, save, sqlFile } from "../platform/testDatabase.ts";

// --- Database: supabase/profile_read_model.sql — get_profile_history ------------------------------------------
// Trips = accepted, profile-backed golf_trip_members rows. Tournaments = profile → tournament_players → edition_roster,
// with that edition's team and captaincy. Access roles (tournament_members) are never playing history.

async function setup(): Promise<PGlite> {
  const db = await database();
  for (const file of ["golf_trips.sql", "golf_trip_invitations.sql", "platform_next_edition.sql", "player_rounds.sql", "profile_read_model.sql", "profile_read_model.sql"]) {
    await db.exec(sqlFile(file));
  }
  return db;
}
type Trip = { id: string; name: string; role: string; playerCount: number };
type Edition = { slug: string; name: string; year: number; team: { name: string; color: string } | null; isCaptain: boolean };
type History = { restricted: boolean; scope?: string; trips: Trip[]; tournaments: Edition[] };
const one = async <T>(db: PGlite, sql: string, params: unknown[]) => (await db.query<{ r: T }>(sql, params)).rows[0].r;
const history = (db: PGlite, viewer: string | null, subject: string) => one<History>(db, "select get_profile_history($1, $2) as r", [viewer, subject]);

const TRIP_DRAFT = {
  requestId: "", tripName: "Pinehurst", destination: "Pinehurst, NC", startDate: "2027-04-22", endDate: "2027-04-26",
  playerCount: "8", yourName: "Cade", yourEmail: "cade@example.com", golfDays: "1", day1Date: "2027-04-23", day1Rounds: "1", round1Course: "",
  includesTournament: "no", knowsLodging: "no", knowsFlights: "yes", knowsTransportation: "no",
};
async function makeTrip(db: PGlite, who: string) {
  const p = golfTripPayloadFromBody({ ...TRIP_DRAFT, requestId: randomUUID() }) as { ok: true; payload: CreateGolfTripPayload };
  return (await one<{ tripId: string }>(db, "select create_golf_trip($1, $2) as r", [who, JSON.stringify(p.payload)])).tripId;
}
const invite = (db: PGlite, who: string, trip: string, token: string, name: string) =>
  one(db, "select invite_golf_trip_member($1, $2, $3, $4) as r", [who, trip, JSON.stringify({ displayName: name, email: `${name}@email.com` }), token]);
const TOKEN = (n: number) => `invite-secret-${n}-0123456789abcdefghijklmn`;

test("a brand-new golfer has a whole, empty history — not an error", async () => {
  const db = await setup();
  const newbie = await profile(db, "newbie");
  assert.deepEqual(await history(db, newbie, newbie), { restricted: false, scope: "owner", trips: [], tournaments: [] });
});

test("golf trips: the organizer and accepted members count; pending and declined invitations don't", async () => {
  const db = await setup();
  const [cade, jake, john] = [await profile(db, "cade"), await profile(db, "jake"), await profile(db, "john")];
  const trip = await makeTrip(db, cade);
  await invite(db, cade, trip, TOKEN(1), "jake");
  await invite(db, cade, trip, TOKEN(2), "john");
  await invite(db, cade, trip, TOKEN(3), "nobody"); // never signs up: stays a pending row with no profile
  // Before accepting, Jake's invitation is not trip history.
  assert.deepEqual((await history(db, jake, jake)).trips, []);
  await one(db, "select accept_golf_trip_invitation($1, $2) as r", [jake, TOKEN(1)]);
  await one(db, "select decline_golf_trip_invitation($1, $2) as r", [john, TOKEN(2)]);

  const cades = (await history(db, cade, cade)).trips;
  assert.deepEqual(cades.map((t) => [t.name, t.role, t.playerCount]), [["Pinehurst", "organizer", 2]], "players = organizer + Jake");
  assert.deepEqual((await history(db, jake, jake)).trips.map((t) => [t.name, t.role]), [["Pinehurst", "member"]]);
  assert.deepEqual((await history(db, john, john)).trips, [], "declined is not participation");
  // Nothing about the other travelers comes back: no emails, names or profile ids.
  const shown = JSON.stringify(await history(db, cade, cade));
  for (const secret of ["@", "jake", "john", "nobody", jake, john, cade, "invite"]) assert.equal(shown.includes(secret), false, `leaked ${secret}`);
});

test("tournaments: every edition played, each with that year's team and captaincy; access roles are not playing", async () => {
  const db = await setup();
  const owner = await profile(db, "owner", { approved: true });
  const edition = await createTournament(db, owner, { ...quick, competitionType: "teams", teamNames: ["Blue", "Gold"], formats: ["Singles", null, null] });
  const s = await load(db, owner, edition);
  const [blue, gold] = s.teams;
  await save(db, owner, edition, "players", { players: [{ name: "Ann Lee", teamKey: blue.key }, { name: "Di Moss", teamKey: gold.key }] });
  const players = Object.fromEntries((await load(db, owner, edition)).players.map((p) => [p.name, p.id]));
  await save(db, owner, edition, "teams", { competitionType: "teams", teams: [
    { id: blue.id, name: blue.name, color: blue.color, captainPlayerId: players["Ann Lee"] }, { id: gold.id, name: gold.name, color: gold.color, captainPlayerId: null }] });
  const ann = await profile(db, "annlee");
  await db.query("update tournament_players set profile_id = $1, claimed_at = now() where id = $2", [ann, players["Ann Lee"]]);
  // A viewer member of the tournament (access only).
  const viewer = await profile(db, "viewer");
  await db.query("insert into tournament_members (tournament_id, profile_id, role) select tournament_id, $2, 'viewer' from tournament_editions where id = $1", [edition, viewer]);

  // 2028: the same Ann returns, now on Gold and not captain.
  const made = await one<{ editionId: string }>(db, "select create_next_edition($1, $2, $3) as r",
    [owner, edition, JSON.stringify({ seasonYear: 2028, keepTeams: true, playerIds: [players["Ann Lee"]] })]);
  const s2028 = await load(db, owner, made.editionId);
  const gold2028 = s2028.teams.find((t) => t.name === "Gold")!;
  await save(db, owner, made.editionId, "players", { players: s2028.players.map((p) => ({ id: p.id, name: p.name, teamKey: gold2028.key })) });

  const anns = (await history(db, ann, ann)).tournaments;
  assert.deepEqual(anns.map((t) => [t.year, t.name, t.team?.name, t.isCaptain]), [[2028, "Texas Cup", "Gold", false], [2027, "Texas Cup", "Blue", true]]);
  // The organizer runs it but isn't on a roster; the viewer can see it but doesn't play: neither has tournament history.
  assert.deepEqual((await history(db, owner, owner)).tournaments, []);
  assert.deepEqual((await history(db, viewer, viewer)).tournaments, []);
  // An organizer who also plays (claims a player on the roster) does.
  await save(db, owner, made.editionId, "players", { players: [...s2028.players.map((p) => ({ id: p.id, name: p.name, teamKey: gold2028.key })), { name: "Owen Organizer" }] });
  const owen = (await load(db, owner, made.editionId)).players.find((p) => p.name === "Owen Organizer")!.id;
  await db.query("update tournament_players set profile_id = $1, claimed_at = now() where id = $2", [owner, owen]);
  assert.deepEqual((await history(db, owner, owner)).tournaments.map((t) => [t.year, t.team]), [[2028, null]]);
  // No profile ids, player ids or emails in the payload.
  const shown = JSON.stringify(await history(db, ann, ann));
  for (const secret of ["@", ann, owner, players["Ann Lee"]]) assert.equal(shown.includes(secret), false, `leaked ${secret}`);
});

test("others: a Private profile gives nothing; a Public one gives public tournaments' published years and never trips", async () => {
  const db = await setup();
  const [cade, jake] = [await profile(db, "cade"), await profile(db, "jake")];
  await makeTrip(db, cade);
  assert.deepEqual(await history(db, jake, cade), { restricted: true, trips: [], tournaments: [] });
  assert.deepEqual(await history(db, null, cade), { restricted: true, trips: [], tournaments: [] });
  assert.deepEqual(await history(db, cade, randomUUID()), { restricted: true, trips: [], tournaments: [] });
  // Public: trips still never shown; only public tournaments' published, non-test years.
  await db.query("update profiles set rounds_visibility = 'public' where id = $1", [cade]);
  const owner = await profile(db, "owner", { approved: true });
  const shown = await createTournament(db, owner, { ...quick, name: "Open Cup", slug: "open-cup", visibility: "public" });
  const unpublished = await createTournament(db, owner, { ...quick, name: "Draft Cup", slug: "draft-cup", visibility: "public" });
  const privateCup = await createTournament(db, owner, { ...quick, name: "Club Cup", slug: "club-cup", visibility: "private" });
  for (const edition of [shown, unpublished, privateCup]) {
    await save(db, owner, edition, "players", { players: [{ name: "Cade" }] });
    await db.query("update tournament_players set profile_id = $1 where id = $2", [cade, (await load(db, owner, edition)).players[0].id]);
  }
  await db.query("update tournament_editions set published_at = now() where id = any($1)", [[shown, privateCup]]);
  const asJake = await history(db, jake, cade);
  assert.deepEqual([asJake.restricted, asJake.scope, asJake.trips], [false, "public", []]);
  assert.deepEqual(asJake.tournaments.map((t) => t.name), ["Open Cup"]);
  assert.deepEqual((await history(db, null, cade)).tournaments.map((t) => t.name), ["Open Cup"], "signed out: the same public view");
  assert.equal((await history(db, cade, cade)).trips.length, 1, "the owner still sees their trip");
  assert.deepEqual((await history(db, cade, cade)).tournaments.map((t) => t.name).sort(), ["Club Cup", "Draft Cup", "Open Cup"]);
  await db.exec("set role authenticated");
  await assert.rejects(db.query("select get_profile_history($1, $2)", [cade, cade]));
  await db.exec("reset role");
});
