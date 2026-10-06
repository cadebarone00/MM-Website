import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlayerRound, type PlayerRound } from "./playerRounds.ts";
import { defaultRoundVisibility, profileRounds } from "./roundVisibility.ts";

const r = (id: string, extra: Partial<PlayerRound>): PlayerRound => buildPlayerRound({
  id, profileId: "owner", source: "trip", datePlayed: "2027-04-12", course: { ref: null, name: "Pine", place: "" }, tee: null,
  holesPlayed: 18, format: "Stroke play", enteredBy: "player", holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, strokes: 4, putts: 2, fairway: null, green: null })), ...extra,
});
const rounds = [r("trip", {}), r("pubPersonal", { source: "personal", visibility: "public" }), r("privPersonal", { source: "personal", visibility: "private" }), r("removed", { removedFromProfile: true })];
const seen = (viewerId: string, profileVisibility: "public" | "private") => profileRounds(rounds, { viewerId, ownerId: "owner", profileVisibility }).map((x) => x.id);

test("you see all your own rounds except ones you removed", () => assert.deepEqual(seen("owner", "private"), ["trip", "pubPersonal", "privPersonal"]));
test("others see a personal round only with a Public profile AND a Public round", () => assert.deepEqual(seen("other", "public"), ["trip", "pubPersonal"]));
test("a Private profile shows others nothing", () => assert.deepEqual(seen("other", "private"), []));
test("a new personal round starts matching the profile", () => assert.equal(defaultRoundVisibility("public"), "public"));
