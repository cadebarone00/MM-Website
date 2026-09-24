import test from "node:test";
import assert from "node:assert/strict";
import { calculateSkinsResults, type SkinsRound } from "./calculate";
import { nameSkinOpponents } from "./opponents";

test("a winning hole retains only the other eleven scores in its own session", () => {
  const rounds: SkinsRound[] = Array.from({ length: 12 }, (_, i) => ({
    player: `player-${i}`, round: 7, course: "Pete Dye", format: "Singles",
    holes: [{ hole: 3, score: i === 0 ? 3 : 4 + i % 3, par: 4 }],
  }));
  rounds.push({ ...rounds[0], round: 8, player: "different-session" });
  const win = calculateSkinsResults(rounds).wins[0];
  assert.equal(win.opponents.length, 11);
  assert.ok(win.opponents.every((opponent) => opponent.player !== win.player && opponent.player !== "different-session"));
  assert.deepEqual(win.opponents[0], { player: "player-1", score: 5, par: 4 });
});

test("opponents sort by first name and use first/last initials", () => {
  const result = nameSkinOpponents([
    { player: "nate", score: 4, par: 4 }, { player: "drew", score: 5, par: 4 }, { player: "cade", score: 6, par: 4 },
  ], new Map([["nate", "Nate Wojciechowski"], ["drew", "Drew Weisser"], ["cade", "Cade Barone"]]));
  assert.deepEqual(result.map((player) => player.initials), ["CB", "DW", "NW"]);
  assert.deepEqual(result.map((player) => player.score), [6, 5, 4]);
});
