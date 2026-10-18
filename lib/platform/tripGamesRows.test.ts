import assert from "node:assert/strict";
import test from "node:test";
import { savedTripGamesFromJson, tripGameActionFromBody, tripGameFromSaved } from "./tripGamesRows.ts";

const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", G = "33333333-3333-4333-8333-333333333333";

test("saved games are read safely and become the Games tab's games (picks by hole, players by name)", () => {
  const rows = savedTripGamesFromJson([
    { id: G, roundNumber: 2, gameType: "wolf", net: true, birdiesDouble: false, teams: null, started: true, mine: false,
      players: [{ profileId: A, displayName: "Cam" }, { profileId: B, displayName: "Cade" }], picks: { "1": { wolfPartner: 1 }, "40": {} }, pars: null },
    { id: "x", roundNumber: 1, gameType: "poker", players: [] },
  ]);
  assert.equal(rows?.length, 1, "unknown game dropped");
  const game = tripGameFromSaved(rows![0]);
  assert.deepEqual(game.players, ["Cam", "Cade"]);
  assert.deepEqual(game.inputs[0], { wolfPartner: 1 });
  assert.equal(game.inputs.length, 18);
  assert.equal(game.mine, false);
  assert.equal(savedTripGamesFromJson({}), null);
});

test("requests are checked before reaching the database", () => {
  assert.equal(tripGameActionFromBody({ action: "create", round: 1, requestId: G, game: { gameType: "skins", players: [A, B] } }).ok, true);
  assert.equal(tripGameActionFromBody({ action: "create", round: 1, requestId: G, game: { gameType: "skins", players: ["not-an-id", B] } }).ok, false);
  assert.equal(tripGameActionFromBody({ action: "create", round: 1, requestId: G, game: { gameType: "skins", players: [A] } }).ok, false);
  assert.equal(tripGameActionFromBody({ action: "pick", gameId: G, hole: 19, pick: {} }).ok, false);
  assert.equal(tripGameActionFromBody({ action: "pick", gameId: G, hole: 3, pick: null }).ok, true);
  assert.equal(tripGameActionFromBody({ action: "update", gameId: G, patch: { teams: [0, 1, 2] } }).ok, false);
  assert.equal(tripGameActionFromBody({ action: "delete", gameId: "nope" }).ok, false);
});
