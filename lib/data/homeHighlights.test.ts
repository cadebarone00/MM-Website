import { test } from "node:test";
import assert from "node:assert/strict";
import { getHomeHighlights, homeHighlightsYear } from "./homeHighlights";
import { palmSprings2026 } from "./2026-palm-springs";

const legacy = { selectedYear: null, scheduled: false, leaderboardOpen: false, nextTournament: { year: 2027 }, latestCompleted: { year: 2026 } };

test("Home highlights honor explicit years, calendar handoff, and legacy New Year handoff", () => {
  assert.equal(homeHighlightsYear(legacy), 2026);
  assert.equal(homeHighlightsYear({ ...legacy, selectedYear: 2026, scheduled: true, leaderboardOpen: true }), 2026);
  assert.equal(homeHighlightsYear({ ...legacy, selectedYear: 2027 }), 2027);
  assert.equal(homeHighlightsYear({ ...legacy, scheduled: true }), 2027);
  assert.equal(homeHighlightsYear({ ...legacy, leaderboardOpen: true }), 2027);
  assert.equal(homeHighlightsYear({ ...legacy, scheduled: true, nextTournament: { year: 2028 } }), 2028);
});

test("unpopulated years are blank, even when the latest completed season is 2026", () => {
  for (const year of [2024, 2025, 2027, 2028, 2033]) assert.deepEqual(getHomeHighlights(year), []);
  assert.ok(getHomeHighlights(2026).length > 6);
});

test("2026 highlights link to real archive destinations and preserve verified session totals", () => {
  const highlights = getHomeHighlights(2026);
  assert.equal(new Set(highlights.map(item => item.id)).size, highlights.length);
  for (const item of highlights) {
    assert.ok(item.href.startsWith('/leaderboard/2026-palm-springs'));
    if (item.href.includes('/matches/')) assert.ok(palmSprings2026.matches.some(match => item.href.endsWith('/' + match.id)));
  }
  assert.match(highlights.find(item => item.id === '2026-session-6')!.body, /Overall: Maroon 10½, White 10½/);
  assert.match(highlights.find(item => item.id === '2026-session-7')!.body, /Overall: Maroon 14, White 13/);
  assert.match(highlights.find(item => item.id === '2026-session-8')!.body, /Overall: Maroon 17, White 16/);
  for (const player of ['cam-latto', 'drew-weisser']) {
    const singles = palmSprings2026.matches.filter(match => match.format === 'Singles' && match.maroonPlayers.includes(player));
    assert.equal(singles.length, 3);
    assert.ok(singles.every(match => match.maroonPts === 1));
  }
  assert.equal(palmSprings2026.individualChampion, 'nate-wojciechowski');
  assert.deepEqual(palmSprings2026.individualLeaderboard.slice(0, 3).map(row => row.toPar), [13, 15, 16]);
});
