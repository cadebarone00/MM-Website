import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { ENTITLEMENTS, canCreateTournament, hasEntitlement, maxPlayers } from "./entitlements.ts";

async function seededPlans(): Promise<Record<string, unknown>> {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table profiles(id uuid primary key, is_host boolean); create table player_slots(player_slug text primary key, full_name text, email text, claimed_by uuid);
      create table live_tournament_settings(season_year int primary key, venue_name text, begin_date date, end_date date, timezone text);
      create table live_roster(season_year int, player_slug text, team text);`);
    await db.exec(readFileSync("supabase/platform_foundation.sql", "utf8"));
    const rows = (await db.query<{ key: string; entitlements: unknown }>("select key, entitlements from platform_plans")).rows;
    assert.equal((await db.query<{ mode: string }>("select tournament_creation as mode from platform_settings")).rows[0].mode, "invite_only");
    return Object.fromEntries(rows.map((row) => [row.key, row.entitlements]));
  } finally {
    await db.close();
  }
}

test("The Maroon's founder plan has everything; beta tournaments never get wagers or fantasy", async () => {
  const plans = await seededPlans();
  for (const entitlement of ENTITLEMENTS) assert.equal(hasEntitlement(plans.founder, entitlement), true, entitlement);
  assert.equal(hasEntitlement(plans.beta, "wagers"), false);
  assert.equal(hasEntitlement(plans.beta, "fantasy"), false);
  assert.equal(hasEntitlement(plans.beta, "custom_branding"), true);
  assert.equal(maxPlayers(plans.beta), null);
});

test("anything a plan doesn't explicitly grant is off", () => {
  for (const junk of [null, undefined, "wagers", [], { wagers: "true" }, { wagers: 1 }]) assert.equal(hasEntitlement(junk, "wagers"), false);
  assert.equal(maxPlayers({ max_players: 24 }), 24);
  for (const junk of [{ max_players: 0 }, { max_players: "24" }, { max_players: 2.5 }, null]) assert.equal(maxPlayers(junk), null);
});

test("tournament creation is invite-only now and opens with one setting later", () => {
  const base = { signedIn: true, platformRole: null, creationMode: "invite_only" as const, accessStatus: null };
  assert.equal(canCreateTournament(base), false);
  assert.equal(canCreateTournament({ ...base, accessStatus: "requested" }), false);
  assert.equal(canCreateTournament({ ...base, accessStatus: "approved" }), true);
  assert.equal(canCreateTournament({ ...base, platformRole: "admin" }), true);
  assert.equal(canCreateTournament({ ...base, signedIn: false, platformRole: "admin" }), false);

  const open = { ...base, creationMode: "self_serve" as const };
  assert.equal(canCreateTournament(open), true);
  assert.equal(canCreateTournament({ ...open, accessStatus: "revoked" }), false);
});
