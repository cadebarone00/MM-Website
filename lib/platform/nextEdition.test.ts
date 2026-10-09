import assert from "node:assert/strict";
import test from "node:test";
import { lastYearsRoster, nextEditionDraftFromJson, nextEditionInputFromBody } from "./nextEdition";

const A = "6f1c2a52-8a3e-4c4e-9d55-0d3c8a1b2c3d";
const B = "7f1c2a52-8a3e-4c4e-9d55-0d3c8a1b2c3d";

test("Start next year input: a year, optional dates in order, keep team names or not, returning players (each once)", () => {
  assert.deepEqual(nextEditionInputFromBody({ seasonYear: "2028", startDate: "2028-04-20", endDate: "2028-04-23", keepTeams: true, playerIds: [A, B, A] }),
    { ok: true, input: { seasonYear: 2028, startDate: "2028-04-20", endDate: "2028-04-23", keepTeams: true, playerIds: [A, B] } });
  assert.deepEqual(nextEditionInputFromBody({ seasonYear: 2029 }), { ok: true, input: { seasonYear: 2029, startDate: null, endDate: null, keepTeams: false, playerIds: [] } });
  for (const [body, field] of [
    [{ seasonYear: "20x8" }, "seasonYear"], [{ seasonYear: 1999 }, "seasonYear"], [{ seasonYear: 2028, startDate: "2028-02-30" }, "startDate"],
    [{ seasonYear: 2028, startDate: "2028-04-23", endDate: "2028-04-20" }, "endDate"], [{ seasonYear: 2028, playerIds: ["nope"] }, "playerIds"], [null, "seasonYear"],
  ] as const) {
    const r = nextEditionInputFromBody(body);
    assert.equal(r.ok, false, JSON.stringify(body));
    assert.equal(!r.ok && r.field, field);
  }
});

test("the draft is checked; 'last year's roster' preselects only the players on the year you start from", () => {
  const draft = nextEditionDraftFromJson({ fromYear: 2027, suggestedYear: 2028, existingYears: [2026, 2027], teams: [{ name: "Blue", color: "#123456" }],
    players: [{ id: A, name: "Ann", joined: true, onFromRoster: true, lastSeason: 2027 }, { id: B, name: "Bo", joined: false, onFromRoster: false, lastSeason: 2026 }, { id: "x" }] });
  assert.equal(draft?.players.length, 2, "malformed rows are dropped");
  assert.deepEqual(lastYearsRoster(draft!), [A]);
  assert.equal(nextEditionDraftFromJson(null), null);
  assert.equal(nextEditionDraftFromJson({ fromYear: 2027 }), null);
});
