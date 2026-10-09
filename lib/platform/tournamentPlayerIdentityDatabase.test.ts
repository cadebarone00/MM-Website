import { test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { createTournament, database, load, profile, quick, save, sqlFile } from "./testDatabase.ts";

// --- Database: supabase/tournament_player_identity.sql ---------------------------------------
// profile (who the golfer is) → tournament_players (their place in one tournament, kept across years)
// → edition_roster (that year's roster: team, handicap) — captains live on edition_teams.

async function setup(): Promise<PGlite> {
  const db = await database();
  await db.exec(sqlFile("profile_identity.sql"));
  await db.exec(sqlFile("tournament_player_identity.sql"));
  await db.exec(sqlFile("tournament_player_identity.sql")); // safe to run twice
  return db;
}
const one = async <T>(db: PGlite, sql: string, params: unknown[] = []) => (await db.query<{ r: T }>(sql, params)).rows[0]?.r;
const refused = (promise: Promise<unknown>) => assert.rejects(promise);
const TOKEN = "player-secret-0123456789abcdefghijklmn";

/** Texas Cup 2027: teams Blue / Gold, players Ann (with email) and Cy, organizer = owner. */
async function texasCup(db: PGlite, owner: string) {
  const edition = await createTournament(db, owner, { ...quick, competitionType: "teams", teamNames: ["Blue", "Gold"], roundCount: 1, formats: [null] });
  const s = await load(db, owner, edition);
  await save(db, owner, edition, "players", { players: [{ name: "Ann Lee", email: "ann@secret.example", teamKey: s.teams[0].key }, { name: "Cy Park", teamKey: s.teams[1].key }] });
  const players = (await db.query<{ id: string; display_name: string; tournament_id: string }>(
    "select p.id, p.display_name, p.tournament_id from tournament_players p join edition_roster r on r.tournament_player_id = p.id where r.edition_id = $1 order by p.display_name", [edition])).rows;
  return { edition, tournament: players[0].tournament_id, ann: players[0].id, cy: players[1].id };
}
const playerRow = (db: PGlite, id: string) =>
  db.query<{ profile_id: string | null; claimed_at: string | null }>("select profile_id, claimed_at from tournament_players where id = $1", [id]).then((r) => r.rows[0]);
const invite = (db: PGlite, who: string, player: string, token = TOKEN) => one<boolean>(db, "select invite_tournament_player($1, $2, $3) as r", [who, player, token]);
const accept = (db: PGlite, who: string, token = TOKEN) => one<{ status: string; tournamentId?: string }>(db, "select accept_tournament_player_invitation($1, $2) as r", [who, token]);
const preview = (db: PGlite, who: string | null, token = TOKEN) => one<Record<string, unknown> | null>(db, "select get_tournament_player_invitation($1, $2) as r", [who, token]);

test("an organizer-added golfer is a tournament player with no profile until they claim it — the same row", async () => {
  const db = await setup();
  const owner = await profile(db, "owner", { approved: true });
  const { tournament, ann } = await texasCup(db, owner);
  assert.equal((await playerRow(db, ann)).profile_id, null, "unclaimed: profile_id NULL, no fake profile");
  assert.equal(await invite(db, owner, ann), true);
  const shown = await preview(db, null);
  assert.deepEqual([shown?.playerName, shown?.status], ["Ann Lee", "open"]);
  assert.equal(JSON.stringify(shown).includes("ann@secret.example"), false, "the invite never shows the email");
  const annProfile = await profile(db, "annlee");
  assert.deepEqual(await accept(db, annProfile), { status: "accepted", tournamentId: tournament });
  const row = await playerRow(db, ann);
  assert.equal(row.profile_id, annProfile);
  assert.ok(row.claimed_at);
  assert.equal((await db.query<{ n: number }>("select count(*)::int n from tournament_players where tournament_id = $1", [tournament])).rows[0].n, 2, "no new player row");
  assert.equal(await one(db, "select role as r from tournament_members where tournament_id = $1 and profile_id = $2", [tournament, annProfile]), "player",
    "the claimed golfer can now see their (private) tournament");
  // Safe to repeat; nobody else can take it; the link can't be reused for another player.
  assert.deepEqual(await accept(db, annProfile), { status: "already_player", tournamentId: tournament });
  assert.deepEqual(await accept(db, await profile(db, "intruder")), { status: "claimed" });
});

test("one profile, one player per tournament; a claimed player can never move to another profile", async () => {
  const db = await setup();
  const owner = await profile(db, "owner", { approved: true });
  const { ann, cy } = await texasCup(db, owner);
  const golfer = await profile(db, "golfer");
  await invite(db, owner, ann);
  await accept(db, golfer);
  await invite(db, owner, cy, "cy-secret-0123456789abcdefghijklmnopq");
  assert.deepEqual((await accept(db, golfer, "cy-secret-0123456789abcdefghijklmnopq")).status, "already_player", "a second spot in the same tournament is refused");
  assert.equal((await playerRow(db, cy)).profile_id, null);
  await refused(db.query("update tournament_players set profile_id = $1 where id = $2", [golfer, cy]));
  await refused(db.query("update tournament_players set profile_id = $1 where id = $2", [await profile(db, "other"), ann]));
  // Only an organizer invites, and only unclaimed players get links.
  assert.equal(await invite(db, golfer, cy, "golfer-try-0123456789abcdefghijklmnop"), false);
  assert.equal(await invite(db, owner, ann, "late-secret-0123456789abcdefghijklmno"), false, "already claimed");
  await refused(invite(db, owner, cy, "short"));
  // A new link replaces the old one on the same player.
  assert.equal(await invite(db, owner, cy, "cy-new-0123456789abcdefghijklmnopqrs"), true);
  assert.equal(await preview(db, null, "cy-secret-0123456789abcdefghijklmnopq"), null);
});

test("the same profile plays different tournaments; across editions one player keeps changing teams and captaincy", async () => {
  const db = await setup();
  const owner = await profile(db, "owner", { approved: true });
  const cup = await texasCup(db, owner);
  const golfer = await profile(db, "golfer");
  await invite(db, owner, cup.ann);
  await accept(db, golfer);
  // A different tournament: same profile, its own player row.
  const other = await createTournament(db, owner, { ...quick, name: "Desert Open", slug: "desert-open", competitionType: "individual" });
  await save(db, owner, other, "players", { players: [{ name: "Ann L." }] });
  const desertPlayer = await one<string>(db, "select p.id as r from tournament_players p join edition_roster r on r.tournament_player_id = p.id where r.edition_id = $1", [other]);
  await invite(db, owner, desertPlayer, "desert-secret-0123456789abcdefghijklm");
  assert.equal((await accept(db, golfer, "desert-secret-0123456789abcdefghijklm")).status, "accepted");
  // Next year of Texas Cup: the SAME tournament player is on the 2028 roster, on the other team, as captain.
  const e2028 = await one<string>(db, "insert into tournament_editions (tournament_id, season_year, label) values ($1, 2028, 'Texas Cup 2028') returning id as r", [cup.tournament]);
  const gold = await one<string>(db, "insert into edition_teams (edition_id, key, name) values ($1, 'gold', 'Gold') returning id as r", [e2028]);
  await db.query("insert into edition_roster (edition_id, tournament_id, tournament_player_id, team_id) values ($1, $2, $3, $4)", [e2028, cup.tournament, cup.ann, gold]);
  await db.query("update edition_teams set captain_player_id = $1 where id = $2", [cup.ann, gold]);
  // Profile history: tournaments, editions, teams, captaincy — all through the player record, nothing on the profile.
  const history = (await db.query<{ tournament: string; season: number; team: string | null; captain: boolean }>(`
    select t.name tournament, e.season_year::int as season, tm.name team, coalesce(tm.captain_player_id = p.id, false) captain
    from tournament_players p join tournaments t on t.id = p.tournament_id
    join edition_roster r on r.tournament_player_id = p.id join tournament_editions e on e.id = r.edition_id
    left join edition_teams tm on tm.id = r.team_id
    where p.profile_id = $1 order by t.name, e.season_year`, [golfer])).rows;
  assert.deepEqual(history.map((h) => [h.tournament, h.season, h.team, h.captain]), [
    ["Desert Open", 2027, null, false], ["Texas Cup", 2027, "Blue", false], ["Texas Cup", 2028, "Gold", true]]);
  const profileColumns = (await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'profiles'")).rows.map((c) => c.column_name);
  assert.equal(profileColumns.some((c) => /team|captain/.test(c)), false, "no team or captain on profiles");
});

test("the public site shows names, teams and captains — never emails, profile or player ids", async () => {
  const db = await setup();
  const owner = await profile(db, "owner", { approved: true });
  const cup = await texasCup(db, owner);
  const golfer = await profile(db, "golfer");
  await invite(db, owner, cup.ann);
  await accept(db, golfer);
  await db.query("select set_edition_published($1, $2, true)", [owner, cup.edition]);
  await db.query("update tournaments set visibility = 'public' where id = $1", [cup.tournament]);
  const site = JSON.stringify(await one(db, "select get_public_tournament_site('texas-cup', 2027, null) as r"));
  assert.match(site, /Ann Lee/);
  for (const secret of ["ann@secret.example", golfer, cup.ann, cup.cy, owner]) assert.equal(site.includes(secret), false, secret);
});

test("legacy Maroon players stay bridged: claiming a player slot links that tournament player to the profile", async () => {
  const db = await setup();
  const maroon = await one<string>(db, "select id as r from tournaments where slug = 'the-maroon-tournament'");
  const cade = await profile(db, "cade");
  const slotPlayer = await one<string>(db, "select id as r from tournament_players where tournament_id = $1 and legacy_player_slug = 'cade-barone'", [maroon]);
  assert.equal((await playerRow(db, slotPlayer)).profile_id, null);
  // What signup / admin invite do: claim the slot (and set the profile's legacy mapping).
  await db.query("update player_slots set claimed_by = $1 where player_slug = 'cade-barone'", [cade]);
  assert.equal((await playerRow(db, slotPlayer)).profile_id, cade, "the bridge follows the claim");
  // Admin unlink clears it again (an explicit admin action, not a transfer).
  await db.query("update player_slots set claimed_by = null where player_slug = 'cade-barone'");
  assert.equal((await playerRow(db, slotPlayer)).profile_id, null);
  // Legacy live data is still keyed by player_slug and untouched.
  assert.ok(await one(db, "select count(*)::int as r from player_slots where player_slug = 'cade-barone'"));
});

test("existing slot claims are backfilled once", async () => {
  const db = await database();
  await db.exec(sqlFile("profile_identity.sql"));
  const maroon = await one<string>(db, "select id as r from tournaments where slug = 'the-maroon-tournament'");
  const cam = await profile(db, "cam");
  await db.query("update player_slots set claimed_by = $1 where player_slug = 'cam-latto'", [cam]); // claimed before this file existed
  await db.exec(sqlFile("tournament_player_identity.sql"));
  assert.equal(await one(db, "select profile_id as r from tournament_players where tournament_id = $1 and legacy_player_slug = 'cam-latto'", [maroon]), cam);
});

test("decline: no profile attached, the link dies; the organizer sees joined / invited / declined and can invite again", async () => {
  const db = await setup();
  const owner = await profile(db, "owner", { approved: true });
  const cup = await texasCup(db, owner);
  const names = Object.fromEntries((await load(db, owner, cup.edition)).players.map((p) => [p.id, p.name]));
  const statuses = async () => Object.fromEntries(Object.entries(await one<Record<string, string>>(db, "select list_edition_player_invites($1, $2) as r", [owner, cup.edition]) ?? {})
    .map(([id, status]) => [names[id], status]));
  assert.deepEqual(await statuses(), { "Ann Lee": "none", "Cy Park": "none" });
  await invite(db, owner, cup.ann);
  await invite(db, owner, cup.cy, "cy-secret-0123456789abcdefghijklmnopq");
  assert.deepEqual(await statuses(), { "Ann Lee": "invited", "Cy Park": "invited" });
  const someone = await profile(db, "someone");
  assert.deepEqual(await one(db, "select decline_tournament_player_invitation($1, $2) as r", [someone, TOKEN]), { status: "declined" });
  assert.equal((await playerRow(db, cup.ann)).profile_id, null);
  assert.equal(await preview(db, someone), null);
  assert.deepEqual(await accept(db, someone), { status: "not_found" }, "a declined link can't be accepted later");
  await accept(db, await profile(db, "cypark"), "cy-secret-0123456789abcdefghijklmnopq");
  assert.deepEqual(await statuses(), { "Ann Lee": "declined", "Cy Park": "joined" });
  // You can't decline a place you already hold.
  await refused(db.query("select decline_tournament_player_invitation($1, $2)", ["00000000-0000-0000-0000-000000000000", TOKEN]));
  assert.equal(await invite(db, owner, cup.ann, "ann-again-0123456789abcdefghijklmnopq"), true, "invite again after a decline");
  assert.deepEqual(await statuses(), { "Ann Lee": "invited", "Cy Park": "joined" });
  assert.equal(await one(db, "select list_edition_player_invites($1, $2) as r", [someone, cup.edition]), null, "only organizers see invite statuses");
});

test("platform admins may make invite links too (same rule as the dashboard); plain players may not", async () => {
  const db = await setup();
  const owner = await profile(db, "owner", { approved: true });
  const cup = await texasCup(db, owner);
  assert.equal(await invite(db, await profile(db, "admin", { admin: true }), cup.ann), true);
  const member = await profile(db, "member");
  await db.query("insert into tournament_members (tournament_id, profile_id, role) values ($1, $2, 'player')", [cup.tournament, member]);
  assert.equal(await invite(db, member, cup.cy, "member-try-0123456789abcdefghijklmnop"), false);
});

// --- Recurring tournaments: one tournament player, many editions -----------------------------

/** Texas Cup 2028: a second edition of the same tournament with its own Blue / Gold teams (no app flow makes one yet). */
async function nextEdition(db: PGlite, tournament: string, firstEdition: string) {
  const e = await one<string>(db, "insert into tournament_editions (tournament_id, season_year, label) values ($1, 2028, 'Texas Cup 2028') returning id as r", [tournament]);
  await db.query("insert into edition_settings (edition_id, scoring, plan) select $1, scoring, plan from edition_settings where edition_id = $2", [e, firstEdition]);
  await db.query("insert into edition_teams (edition_id, key, name, sort_order) values ($1, 'blue', 'Blue', 0), ($1, 'gold', 'Gold', 1)", [e]);
  return e;
}
const pool = (db: PGlite, who: string, edition: string) =>
  one<{ id: string; name: string; email: string | null; joined: boolean; lastSeason: number | null }[] | null>(db, "select list_tournament_player_pool($1, $2) as r", [who, edition]);
const playersIn = async (db: PGlite, tournament: string) => (await db.query<{ n: number }>("select count(*)::int n from tournament_players where tournament_id = $1", [tournament])).rows[0].n;

test("a claimed player comes back next year as the SAME tournament player: new roster entry, new team, no captaincy carried over", async () => {
  const db = await setup();
  const owner = await profile(db, "owner", { approved: true });
  const cup = await texasCup(db, owner);
  const golfer = await profile(db, "golfer");
  await invite(db, owner, cup.ann);
  await accept(db, golfer);
  const s2027 = await load(db, owner, cup.edition);
  const blue2027 = s2027.teams.find((t) => t.name === "Blue")!;
  await save(db, owner, cup.edition, "teams", { competitionType: "teams", teams: s2027.teams.map((t) => ({ id: t.id, name: t.name, color: t.color, captainPlayerId: t.id === blue2027.id ? cup.ann : null })) });
  const e2028 = await nextEdition(db, cup.tournament, cup.edition);
  // The organizer sees last year's players (not yet on 2028) and picks Ann.
  const before = await pool(db, owner, e2028);
  assert.deepEqual(before?.map((p) => [p.name, p.joined, p.lastSeason]), [["Ann Lee", true, 2027], ["Cy Park", false, 2027]]);
  assert.equal(JSON.stringify(before).includes(golfer), false, "no profile ids in the pool");
  const s2028 = await load(db, owner, e2028);
  const gold2028 = s2028.teams.find((t) => t.key === "gold")!;
  await save(db, owner, e2028, "players", { players: [{ id: cup.ann, name: "Ann Lee", email: "ann@secret.example", teamKey: gold2028.key }] });
  assert.equal(await playersIn(db, cup.tournament), 2, "no new tournament player");
  const rosters = (await db.query<{ season: number; team: string | null }>(`select e.season_year::int season, t.name team from edition_roster r
    join tournament_editions e on e.id = r.edition_id left join edition_teams t on t.id = r.team_id where r.tournament_player_id = $1 order by e.season_year`, [cup.ann])).rows;
  assert.deepEqual(rosters.map((r) => [r.season, r.team]), [[2027, "Blue"], [2028, "Gold"]]);
  assert.equal((await playerRow(db, cup.ann)).profile_id, golfer, "same profile, no new invite needed");
  assert.equal((await load(db, owner, e2028)).teams.some((t) => t.captainPlayerId === cup.ann), false, "2027 captaincy doesn't carry to 2028");
  assert.deepEqual((await pool(db, owner, e2028))?.map((p) => p.name), ["Cy Park"], "once added, Ann leaves the pool");
});

test("an unclaimed player is reused only when the organizer picks them; their open invite stays; new names are new players", async () => {
  const db = await setup();
  const owner = await profile(db, "owner", { approved: true });
  const cup = await texasCup(db, owner);
  await invite(db, owner, cup.cy, "cy-secret-0123456789abcdefghijklmnopq");
  const e2028 = await nextEdition(db, cup.tournament, cup.edition);
  // Typing a new "Cy Park" (no existing player picked) is a NEW person — never merged by name.
  await save(db, owner, e2028, "players", { players: [{ name: "Cy Park", teamKey: "gold" }] });
  assert.equal(await playersIn(db, cup.tournament), 3, "two same-name players are never merged");
  assert.deepEqual((await pool(db, owner, e2028))?.map((p) => [p.name, p.id === cup.cy]), [["Ann Lee", false], ["Cy Park", true]], "the original Cy is still a separate player");
  // Picking the existing Cy (organizer intent) reuses that player; their open invite still works.
  const newCy = await one<string>(db, "select tournament_player_id as r from edition_roster where edition_id = $1", [e2028]);
  await save(db, owner, e2028, "players", { players: [{ id: newCy, name: "Cy Park (new)", teamKey: "gold" }, { id: cup.cy, name: "Cy Park", teamKey: "blue" }] });
  assert.equal(await playersIn(db, cup.tournament), 3, "reusing creates nothing");
  assert.equal((await preview(db, null, "cy-secret-0123456789abcdefghijklmnopq"))?.playerName, "Cy Park", "the reused player's invite still works");
  const golfer = await profile(db, "cyreal");
  assert.equal((await accept(db, golfer, "cy-secret-0123456789abcdefghijklmnopq")).status, "accepted");
  const cyRosters = await one<number>(db, "select count(*)::int as r from edition_roster where tournament_player_id = $1", [cup.cy]);
  assert.equal(cyRosters, 2, "claiming once covers every edition they're on");
});

test("one player once per edition; players can't be borrowed from another tournament; only organizers see the pool", async () => {
  const db = await setup();
  const owner = await profile(db, "owner", { approved: true });
  const cup = await texasCup(db, owner);
  await refused(db.query("insert into edition_roster (edition_id, tournament_id, tournament_player_id) values ($1, $2, $3)", [cup.edition, cup.tournament, cup.ann]));
  // Sending the same player twice in one save (straight to the database) still leaves one roster entry.
  await db.query("select save_tournament_section($1, $2, 'players', $3)", [owner, cup.edition, JSON.stringify({ players: [{ id: cup.ann, name: "Ann Lee" }, { id: cup.cy, name: "Cy Park" }, { id: cup.ann, name: "Ann Lee" }] })]);
  assert.equal(await one<number>(db, "select count(*)::int as r from edition_roster where edition_id = $1 and tournament_player_id = $2", [cup.edition, cup.ann]), 1);
  const other = await createTournament(db, owner, { ...quick, name: "Desert Open", slug: "desert-open" });
  await refused(db.query("select save_tournament_section($1, $2, 'players', $3)", [owner, other, JSON.stringify({ players: [{ id: cup.ann, name: "Ann Lee" }] })]));
  assert.equal(await pool(db, await profile(db, "stranger"), cup.edition), null);
  assert.deepEqual(await pool(db, owner, cup.edition), [], "everyone is already on this edition");
});
