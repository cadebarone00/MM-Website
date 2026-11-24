import { test } from "node:test";
import assert from "node:assert/strict";
import { gameDef, scoreGame, type HoleInput } from "../platform/roundGames.ts";
import { holeRange } from "../platform/personalRound.ts";
import { ROUND_MOMENTS, ROUND_SAMPLE_DEFAULTS, SAMPLE_GAME_SIZES, sampleSharedRound, samplePlayersFor, type RoundSampleOptions } from "./sampleRoundGames.ts";
import { sampleTripGames } from "./sampleTripGames.ts";

const options = (part: Partial<RoundSampleOptions> & Pick<RoundSampleOptions, "game">): RoundSampleOptions => ({ players: 4, ...ROUND_SAMPLE_DEFAULTS, ...part });

/** What the round screen scores: everyone in order (players, then guests), strokes per hole, picks per hole. */
function scored(o: RoundSampleOptions) {
  const { round } = sampleSharedRound(o);
  const setup = round.setup;
  const people = [...round.players.map((p) => ({ key: p.profileId, handicap: p.profileId === round.host ? setup.myHandicap ?? null : setup.players?.find((x) => x.profileId === p.profileId)?.handicap ?? null })),
    ...(setup.guests ?? []).map((g) => ({ key: g.id, handicap: g.handicap }))];
  const strokes = people.map((p) => Array.from({ length: 18 }, (_, h) =>
    round.holes.find((x) => x.profileId === p.key && x.hole === h + 1)?.strokes ?? round.guestHoles?.find((x) => x.guestId === p.key && x.hole === h + 1)?.strokes ?? null));
  const inputs: HoleInput[] = Array.from({ length: 18 }, (_, h) => round.picks.find((k) => k.hole === h + 1)?.pick ?? {});
  const course = { par: setup.course.par, strokeIndex: setup.course.strokeIndex, rating: setup.tee?.rating ?? null, slope: setup.tee?.slope ?? null };
  return { round, strokes, inputs, result: scoreGame(setup.game!, people.map((p, i) => ({ name: `P${i}`, handicap: p.handicap })), course, holeRange(setup.holes), strokes, inputs) };
}

test("every game, every group size it allows, every moment: builds and scores with standings", () => {
  for (const { game, players } of SAMPLE_GAME_SIZES) for (const [thru] of ROUND_MOMENTS) {
    const { round, strokes, inputs, result } = scored(options({ game, players, thru }));
    const label = `${game} ${players}p thru ${thru}`;
    assert.equal(round.players.length + (round.setup.guests?.length ?? 0), players, label);
    assert.ok(strokes.every((row) => row.filter((s) => s != null).length === thru), `${label}: everyone has exactly ${thru} holes`);
    assert.ok(inputs.every((pick, h) => h < thru || Object.keys(pick).length === 0), `${label}: picks only on played holes`);
    assert.ok(result.standings.length > 0, label);
  }
});

test("picks the game needs are filled on every played hole, so nothing waits on a pick", () => {
  for (const game of ["wolf", "daytona", "bbb"] as const) {
    const players = samplePlayersFor(game, undefined);
    const { inputs } = scored(options({ game, players, thru: 18 }));
    const key = game === "wolf" ? "wolfPartner" : game;
    assert.ok(inputs.every((pick) => key in pick), game);
  }
});

test("each game shows its moment: skins carry over, Nassau presses, the snake moves, a Lone Wolf", () => {
  const skins = scored(options({ game: "skins", thru: 9 }));
  assert.ok(skins.result.standings.reduce((sum, s) => sum + s.rank, 0) < 9, "some skins carried (fewer won than holes played)");
  const plain = scored(options({ game: "nassau", players: 2, thru: 9 })).result;
  const pressed = scored(options({ game: "nassau", players: 2, thru: 9, autoPress: true })).result;
  assert.notDeepEqual(pressed, plain, "auto-press changes the Nassau");
  assert.match(scored(options({ game: "snake", thru: 15 })).result.note ?? "", /has the snake/);
  assert.ok(scored(options({ game: "wolf", thru: 9 })).inputs.some((pick) => pick.wolfPartner === null), "a Lone Wolf hole");
});

test("options: only the ones a game has; money, doubles and side games show up in the round", () => {
  assert.equal(sampleSharedRound(options({ game: "scramble", net: true })).round.setup.game!.net, false, "team formats can't be net");
  assert.equal(sampleSharedRound(options({ game: "stroke", birdies: "birdies" })).round.setup.game!.birdiesDouble, false, "stroke play has no birdie bonus");
  assert.equal(sampleSharedRound(options({ game: "match", players: 2, autoPress: true })).round.setup.game!.autoPress, undefined);
  const rich = sampleSharedRound(options({ game: "skins", money: true, doubled: true, sideGames: true, carryovers: false })).round;
  assert.deepEqual([rich.setup.game!.stake, rich.setup.game!.doubles, rich.setup.game!.carryovers], [5, true, false]);
  assert.ok(rich.picks.some((p) => p.pick.doubled) && rich.picks.some((p) => p.pick.greenie !== undefined));
  assert.deepEqual(sampleSharedRound(options({ game: "nassau", players: 2, money: true })).round.setup.game!.nassauStakes, [10, 10, 20]);
});

test("viewer and moment: the host keeps score; a player sees the round end once it's complete", () => {
  const host = sampleSharedRound(options({ game: "stroke", thru: 18 }));
  const player = sampleSharedRound(options({ game: "stroke", thru: 18, viewer: "player" }));
  assert.equal(host.me, host.round.host);
  assert.notEqual(player.me, player.round.host);
  assert.deepEqual([host.round.status, player.round.status], ["live", "ended"]);
  assert.equal(samplePlayersFor("daytona", 4), 5, "a size the game doesn't allow falls back to its own");
  assert.ok(gameDef("nines").players.includes(samplePlayersFor("nines", undefined)));
});

test("Golf Trip → Games sample: one game, picks follow the holes played, not started yet", () => {
  const group = ["Cam", "Cade", "Jake", "Luke"];
  assert.deepEqual(sampleTripGames(1, 18, group, ["Rob"], { only: "wolf" }).map((g) => g.config.id), ["wolf"]);
  const wolf = sampleTripGames(1, 18, group, [], { only: "wolf", played: 18 })[0];
  assert.ok(wolf.inputs.length === 18 && wolf.inputs.every((pick) => "wolfPartner" in pick));
  assert.equal(sampleTripGames(1, 18, group, [], { only: "match", started: false })[0].started, false);
  assert.ok(sampleTripGames(1, 18, group, ["Rob"]).length >= 16, "unfiltered: every game that fits the group");
});
