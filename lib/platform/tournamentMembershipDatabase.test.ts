import { test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { createTournament, database, load, profile, quick, save } from "./testDatabase.ts";

// --- tournament_members = permissions only; tournament_players = who competes -----------------
// A profile's ACCESS (owner / organizer / viewer) and its PLAYING (a claimed tournament_players row) are separate:
// an organizer may or may not play, a player needs no member row, and nothing records "player" twice.

const one = async <T>(db: PGlite, sql: string, params: unknown[] = []) => (await db.query<{ r: T }>(sql, params)).rows[0]?.r;
const refused = (promise: Promise<unknown>) => assert.rejects(promise);

/** Texas Cup 2027, published and public-or-private as asked; Ann + Cy on the roster; returns ids. */
async function cup(db: PGlite, owner: string, visibility: "public" | "private" = "private") {
  const edition = await createTournament(db, owner, { ...quick, visibility, roundCount: 1, formats: [null] });
  await save(db, owner, edition, "players", { players: [{ name: "Ann Lee", email: "ann@secret.example" }, { name: "Cy Park" }] });
  const tournament = await one<string>(db, "select tournament_id as r from tournament_editions where id = $1", [edition]);
  const player = (name: string) => one<string>(db, "select id as r from tournament_players where tournament_id = $1 and display_name = $2", [tournament, name]);
  await db.query("update tournament_editions set published_at = now() where id = $1", [edition]);
  return { edition, tournament: tournament!, ann: (await player("Ann Lee"))!, cy: (await player("Cy Park"))! };
}
/** What claiming does (the invite flow): the golfer's profile on their tournament player. */
const claim = (db: PGlite, player: string, who: string) => db.query("update tournament_players set profile_id = $2, claimed_at = now() where id = $1", [player, who]);
const canView = (db: PGlite, tournament: string, who: string | null) => one<boolean>(db, "select can_view_tournament($1, $2) as r", [tournament, who]);
const managed = async (db: PGlite, who: string) => ((await one<{ setup: { tournament: { slug: string } } }[]>(db, "select list_managed_editions($1) as r", [who])) ?? []).map((t) => t.setup.tournament.slug);
const playing = async (db: PGlite, who: string) => ((await one<{ slug: string }[]>(db, "select list_my_active_editions($1) as r", [who])) ?? []).map((t) => t.slug);
const feed = (db: PGlite, who: string | null) => one<{ viewer: { canSeePlayersOnly: boolean; role: string | null } }>(db, "select get_tournament_activity('texas-cup', 2027, $1, 30) as r", [who]);

test("an organizer who doesn't play manages the tournament but isn't a player", async () => {
  const db = await database();
  const owner = await profile(db, "owner", { approved: true });
  const c = await cup(db, owner);
  const cohost = await profile(db, "cohost");
  await db.query("insert into tournament_members (tournament_id, profile_id, role) values ($1, $2, 'organizer')", [c.tournament, cohost]);
  assert.deepEqual(await managed(db, cohost), ["texas-cup"]);
  assert.deepEqual(await playing(db, cohost), [], "managing isn't playing");
  assert.equal(await canView(db, c.tournament, cohost), true);
  assert.equal(await one(db, "select count(*)::int as r from tournament_players where profile_id = $1", [cohost]), 0);
});

test("an organizer who also plays: one access row + one player row, each meaning one thing", async () => {
  const db = await database();
  const owner = await profile(db, "owner", { approved: true });
  const c = await cup(db, owner);
  await claim(db, c.ann, owner);
  assert.deepEqual(await managed(db, owner), ["texas-cup"]);
  assert.deepEqual(await playing(db, owner), ["texas-cup"]);
  assert.equal(await one(db, "select role as r from tournament_members where tournament_id = $1 and profile_id = $2", [c.tournament, owner]), "owner");
  // Taking away their organizer access never touches their player record or roster history.
  await db.query("delete from tournament_members where tournament_id = $1 and profile_id = $2", [c.tournament, owner]);
  assert.equal(await one(db, "select profile_id as r from tournament_players where id = $1", [c.ann]), owner);
  assert.equal(await one(db, "select count(*)::int as r from edition_roster where tournament_player_id = $1", [c.ann]), 1);
  assert.deepEqual(await managed(db, owner), []);
  assert.deepEqual(await playing(db, owner), ["texas-cup"]);
});

test("a platform admin who doesn't play can manage and see, without being a player or a member", async () => {
  const db = await database();
  const owner = await profile(db, "owner", { approved: true });
  const c = await cup(db, owner);
  const admin = await profile(db, "admin", { admin: true });
  assert.equal(await one(db, "select can_manage_edition($1, $2) as r", [admin, c.edition]), true);
  assert.equal(await canView(db, c.tournament, admin), true);
  assert.deepEqual(await playing(db, admin), []);
  assert.equal(await one(db, "select count(*)::int as r from tournament_members where profile_id = $1", [admin]), 0);
});

test("a normal player's access comes from their player record — no member row needed", async () => {
  const db = await database();
  const owner = await profile(db, "owner", { approved: true });
  const c = await cup(db, owner);
  const golfer = await profile(db, "golfer");
  const stranger = await profile(db, "stranger");
  assert.equal(await canView(db, c.tournament, golfer), false, "private: not yet");
  await claim(db, c.cy, golfer);
  assert.equal(await canView(db, c.tournament, golfer), true, "a claimed player sees their private tournament");
  assert.equal(await canView(db, c.tournament, stranger), false);
  assert.equal((await feed(db, golfer))?.viewer.canSeePlayersOnly, true, "players-only activity");
  assert.equal((await feed(db, stranger)), null, "strangers don't get the private feed");
  assert.deepEqual(await playing(db, golfer), ["texas-cup"]);
  assert.deepEqual(await managed(db, golfer), [], "playing isn't managing");
  assert.equal(await one(db, "select can_manage_edition($1, $2) as r", [golfer, c.edition]), false);
  assert.equal(await one(db, "select count(*)::int as r from tournament_members where profile_id = $1", [golfer]), 0);
});

test("removing a player from the roster ends that edition's participation, not their identity", async () => {
  const db = await database();
  const owner = await profile(db, "owner", { approved: true });
  const c = await cup(db, owner);
  const golfer = await profile(db, "golfer");
  await claim(db, c.cy, golfer);
  const setup = await load(db, owner, c.edition);
  await save(db, owner, c.edition, "players", { players: setup.players.filter((p) => p.name !== "Cy Park").map((p) => ({ id: p.id, name: p.name })) });
  assert.deepEqual(await playing(db, golfer), [], "no longer on this edition's roster");
  assert.equal(await one(db, "select profile_id as r from tournament_players where id = $1", [c.cy]), golfer, "still the same tournament player");
});

test("'player' is no longer a membership role, so the two tables can't contradict each other", async () => {
  const db = await database();
  const owner = await profile(db, "owner", { approved: true });
  const c = await cup(db, owner);
  const someone = await profile(db, "someone");
  await refused(db.query("insert into tournament_members (tournament_id, profile_id, role) values ($1, $2, 'player')", [c.tournament, someone]));
  await db.query("insert into tournament_members (tournament_id, profile_id, role) values ($1, $2, 'viewer')", [c.tournament, someone]);
  assert.equal(await canView(db, c.tournament, someone), true, "viewer access still works");
  assert.deepEqual(await playing(db, someone), [], "a viewer isn't a player");
});

test("the public site still shows no profile ids, emails or account ids", async () => {
  const db = await database();
  const owner = await profile(db, "owner", { approved: true });
  const c = await cup(db, owner, "public");
  const golfer = await profile(db, "golfer");
  await claim(db, c.ann, golfer);
  const site = JSON.stringify(await one(db, "select get_public_tournament_site('texas-cup', 2027, null) as r"));
  assert.match(site, /Ann Lee/);
  for (const secret of ["ann@secret.example", golfer, owner, c.ann]) assert.equal(site.includes(secret), false, secret);
});

test("existing 'player' memberships are tidied: redundant ones go, the rest become viewers; nothing else changes", async () => {
  const db = await database();
  const owner = await profile(db, "owner", { approved: true });
  const c = await cup(db, owner);
  const [golfer, fan] = [await profile(db, "golfer"), await profile(db, "fan")];
  await claim(db, c.ann, golfer);
  // A database from before: 'player' was allowed, and the invite flow wrote it.
  await db.exec("alter table tournament_members drop constraint tournament_members_role_check");
  await db.query("insert into tournament_members (tournament_id, profile_id, role) values ($1, $2, 'player'), ($1, $3, 'player')", [c.tournament, golfer, fan]);
  const { sqlFile } = await import("./testDatabase.ts");
  await db.exec(sqlFile("tournament_player_identity.sql"));
  const roles = Object.fromEntries((await db.query<{ profile_id: string; role: string }>("select profile_id, role from tournament_members where tournament_id = $1", [c.tournament])).rows.map((r) => [r.profile_id, r.role]));
  assert.deepEqual(roles, { [owner]: "owner", [fan]: "viewer" }, "golfer's row was redundant (they're a player); fan keeps access as a viewer");
  assert.equal(await canView(db, c.tournament, golfer), true);
  assert.equal(await canView(db, c.tournament, fan), true);
  assert.equal(await one(db, "select profile_id as r from tournament_players where id = $1", [c.ann]), golfer);
});
